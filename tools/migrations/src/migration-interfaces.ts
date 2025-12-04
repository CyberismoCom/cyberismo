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

import { existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Context passed to migration functions.
 * @param cardRootPath Absolute path to the project's card root directory
 * @param cardsConfigPath Absolute path to the .cards directory
 * @param fromVersion Current schema version before migration
 * @param toVersion Target schema version after migration
 * @param backupDir Parent directory where backups should be created (if user specified one)
 * @param signal AbortSignal for cancellation - migrations should check signal.aborted or pass to cancelable operations
 */
export interface MigrationContext {
  cardRootPath: string;
  cardsConfigPath: string;
  fromVersion: number;
  toVersion: number;
  backupDir?: string;
  signal?: AbortSignal;
}

/**
 * Result of a migration step.
 */
export interface MigrationStepResult {
  success: boolean;
  message?: string;
  error?: Error;
}

/**
 * Result of a complete migration.
 */
export interface MigrationResult extends MigrationStepResult {
  stepsExecuted: string[];
}

/**
 * Interface that migration programs must implement.
 */
export interface Migration {
  /**
   * Pre-migration checks and validation.
   * @param context Migration context
   * @returns Result indicating if migration can proceed
   */
  before?(context: MigrationContext): Promise<MigrationStepResult>;

  /**
   * Create backup of project data before migration.
   * @param context Migration context
   * @returns Result with backup location
   */
  backup?(context: MigrationContext): Promise<MigrationStepResult>;

  /**
   * Cancel the migration gracefully if possible.
   * Called when migration times out or needs to be stopped.
   * If not implemented, the worker will be terminated forcefully when needed to.
   */
  cancel?(): Promise<void>;

  /**
   * Perform the actual migration. This is mandatory to implement.
   * @param context Migration context
   * @returns Result of the migration
   */
  migrate(context: MigrationContext): Promise<MigrationStepResult>;

  /**
   * Post-migration cleanup and verification.
   * @param context Migration context
   * @returns Result of post-migration steps
   */
  after?(context: MigrationContext): Promise<MigrationStepResult>;
}

/**
 * Checks that required directories exist before migration.
 *
 * @param context Migration context
 * @returns Result with success status
 */
export function validateProjectStructure(
  context: MigrationContext,
): MigrationStepResult {
  if (!existsSync(context.cardRootPath)) {
    return {
      success: false,
      message: `Card root path does not exist: ${context.cardRootPath}`,
      error: new Error('Missing cardRoot directory'),
    };
  }

  if (!existsSync(context.cardsConfigPath)) {
    return {
      success: false,
      message: `Cards config path does not exist: ${context.cardsConfigPath}`,
      error: new Error('Missing .cards directory'),
    };
  }

  return {
    success: true,
    message: 'Project structure validation passed',
  };
}

/**
 * Creates backup to folder: backupDir/backup-v<fromVersion>-<timestamp>
 *
 * Note: context.backupDir must be set, otherwise this function returns an error.
 *
 * @param context Migration context
 * @returns Result with success status
 */
export async function createBackup(
  context: MigrationContext,
): Promise<MigrationStepResult> {
  if (!context.backupDir) {
    return {
      success: false,
      message: 'Backup directory not specified in migration context',
      error: new Error('Missing backupDir in context'),
    };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(
    context.backupDir,
    `backup-v${context.fromVersion}-${timestamp}`,
  );

  try {
    await mkdir(backupPath, { recursive: true });

    // Backup .cards directory
    const cardsBackupPath = join(backupPath, '.cards');
    await cp(context.cardsConfigPath, cardsBackupPath, { recursive: true });

    // Backup cardRoot directory if it exists
    const cardRootBackupPath = join(backupPath, 'cardRoot');
    if (existsSync(context.cardRootPath)) {
      await cp(context.cardRootPath, cardRootBackupPath, { recursive: true });
    }

    return {
      success: true,
      message: 'Backup created successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create backup: ${error}`,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
