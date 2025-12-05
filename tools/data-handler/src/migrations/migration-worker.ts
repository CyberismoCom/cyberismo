/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { parentPort } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

import type {
  Migration,
  MigrationContext,
  MigrationStepResult,
} from '@cyberismo/migrations';
import type { WorkerMessage, WorkerResponse } from './migration-executor.js';

let currentMigration: Migration | undefined;
let abortController: AbortController | undefined;

/**
 * Execute a specific step of a migration.
 *
 * Runs one of the migration steps (before, backup, migrate, after).
 * Checks for cancellation before and after execution.
 *
 * @param migration The loaded migration object
 * @param stepName Which step to execute ('before', 'backup', 'migrate', or 'after')
 * @param context Migration context with paths and version information
 * @returns Migration step result
 */
async function executeStep(
  migration: Migration,
  stepName: string,
  context: MigrationContext,
): Promise<MigrationStepResult> {
  if (abortController?.signal.aborted) {
    return {
      success: false,
      error: new Error('Migration cancelled'),
    };
  }

  try {
    let result: MigrationStepResult;

    switch (stepName) {
      case 'before':
        if (!migration.before) {
          return { success: true, message: `No 'before' step` };
        }
        result = await migration.before(context);
        break;

      case 'backup':
        if (!migration.backup) {
          return { success: true, message: `No 'backup' step` };
        }
        result = await migration.backup(context);
        break;

      case 'migrate':
        result = await migration.migrate(context);
        break;

      case 'after':
        if (!migration.after) {
          return { success: true, message: `No 'after' step` };
        }
        result = await migration.after(context);
        break;

      default:
        return {
          success: false,
          error: new Error(`Unknown migration step: ${stepName}`),
        };
    }

    if (abortController?.signal.aborted) {
      return {
        success: false,
        error: new Error('Migration cancelled'),
      };
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Handle a cancellation request from the main thread.
 */
async function handleCancel(): Promise<void> {
  abortController?.abort();

  if (currentMigration?.cancel) {
    try {
      await currentMigration.cancel();
    } catch {
      // Ignore errors during cancellation - we're cancelling anyway
    }
  }
}

/**
 * Worker thread message handler.
 *
 * Listens for messages from the main thread:
 * - 'execute': Run a migration step
 * - 'cancel': Cancel the currently running migration
 *
 * Responds with:
 * - 'result': The migration step result
 * - 'error': An error message when execution failed
 */
if (parentPort) {
  parentPort.on('message', (message: WorkerMessage) => {
    if (!parentPort) return;

    void (async () => {
      try {
        if (message.type === 'cancel') {
          await handleCancel();
          const response: WorkerResponse = {
            type: 'result',
            result: {
              success: false,
              error: new Error('Migration cancelled'),
            },
          };
          parentPort.postMessage(response);
          return;
        }

        if (message.type === 'execute') {
          if (!message.migrationPath || !message.stepName || !message.context) {
            throw new Error('Missing required parameters for "execute"');
          }

          abortController = new AbortController();

          const migrationUrl = pathToFileURL(message.migrationPath).href;
          const migrationModule = await import(migrationUrl);
          currentMigration = migrationModule.default || migrationModule;

          if (typeof currentMigration?.migrate !== 'function') {
            throw new Error(
              `Migration does not implement migrate() function: ${message.migrationPath}`,
            );
          }

          const contextWithSignal: MigrationContext = {
            ...message.context,
            signal: abortController.signal,
          };

          const result = await executeStep(
            currentMigration,
            message.stepName,
            contextWithSignal,
          );

          const response: WorkerResponse = {
            type: 'result',
            result,
          };
          parentPort.postMessage(response);
        }
      } catch (error) {
        const response: WorkerResponse = {
          type: 'error',
          error: error instanceof Error ? error.message : String(error),
        };
        parentPort.postMessage(response);
      }
    })();
  });
}
