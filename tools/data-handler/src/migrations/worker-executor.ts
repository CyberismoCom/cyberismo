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

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { getChildLogger } from '../utils/log-utils.js';
import type {
  MigrationContext,
  MigrationStepResult,
} from '@cyberismo/migrations';
import type { WorkerMessage, WorkerResponse } from './migration-executor.js';

const CANCEL_PERIOD_MS = 100;
const logger = getChildLogger({ module: 'WorkerExecutor' });

/**
 * Execute a migration step in a separate worker thread.
 * The worker loads the migration program dynamically and executes the specified step.
 *
 * @param migrationPath Absolute path to the migration's 'index.js' file
 * @param stepName The migration step to execute
 * @param context Migration context
 * @param timeoutMilliSeconds Timeout in milliseconds to wait for the step to complete
 * @returns Migration step result
 */
export async function executeStep(
  migrationPath: string,
  stepName: string,
  context: MigrationContext,
  timeoutMilliSeconds: number,
): Promise<MigrationStepResult> {
  // Always uses the compiled .js version from the dist directory.
  function _workerPath() {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFilePath);
    const srcMigrationsSegment = join('src', 'migrations');
    const distMigrationsSegment = join('dist', 'migrations');
    const distDir = currentDir.replace(
      srcMigrationsSegment,
      distMigrationsSegment,
    );
    return join(distDir, 'migration-worker.js');
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(_workerPath(), {
      execArgv: process.execArgv,
    });
    let timeoutId: NodeJS.Timeout | undefined;
    let isResolved = false;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const terminate = async (sendCancel: boolean = false): Promise<void> => {
      if (sendCancel) {
        try {
          const cancelMessage: WorkerMessage = { type: 'cancel' };
          worker.postMessage(cancelMessage);
          await new Promise((_resolve) =>
            setTimeout(_resolve, CANCEL_PERIOD_MS),
          );
        } catch {
          // Ignore errors when sending cancel message
        }
      }

      try {
        await worker.terminate();
      } catch (error) {
        logger.debug({ error }, 'Error terminating worker');
      }
    };

    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        cleanup();

        void (async () => {
          await terminate(true);
          resolve({
            success: false,
            error: new Error(`Migration step '${stepName}' timeout`),
          });
        })();
      }
    }, timeoutMilliSeconds);

    worker.on('message', (response: WorkerResponse) => {
      if (isResolved) return;

      isResolved = true;
      cleanup();

      void (async () => {
        if (response.type === 'error') {
          await terminate(false);
          resolve({
            success: false,
            error: new Error(response.error || 'Unknown worker error'),
          });
        } else if (response.type === 'result' && response.result) {
          await terminate(false);
          resolve(response.result);
        } else {
          await terminate(false);
          resolve({
            success: false,
            error: new Error('Invalid worker response'),
          });
        }
      })();
    });

    worker.on('error', (error) => {
      if (isResolved) return;

      isResolved = true;
      cleanup();

      void (async () => {
        await terminate(false);
        resolve({
          success: false,
          error,
        });
      })();
    });

    worker.on('exit', (code) => {
      if (isResolved) return;

      isResolved = true;
      cleanup();

      if (code !== 0) {
        resolve({
          success: false,
          error: new Error(`Worker exited with code ${code}`),
        });
      }
    });

    const migrationContext: MigrationContext = {
      cardRootPath: context.cardRootPath,
      cardsConfigPath: context.cardsConfigPath,
      fromVersion: context.fromVersion,
      toVersion: context.toVersion,
      backupDir: context.backupDir,
    };

    const executeMessage: WorkerMessage = {
      type: 'execute',
      migrationPath,
      stepName,
      context: migrationContext,
    };

    try {
      worker.postMessage(executeMessage);
    } catch (error) {
      isResolved = true;
      cleanup();
      void terminate(false);
      reject(error);
    }
  });
}
