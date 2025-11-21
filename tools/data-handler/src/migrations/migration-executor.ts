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

import { availableMigrations, migration } from '@cyberismo/migrations';
import { availableSpace, folderSize } from '../utils/file-utils.js';
import { executeStep } from './worker-executor.js';
import { getChildLogger } from '../utils/log-utils.js';
import { Validate } from '../commands/validate.js';

import type {
  Migration,
  MigrationContext,
  MigrationResult,
  MigrationStepResult,
} from '@cyberismo/migrations';
import type { Project } from '../containers/project.js';

const DEFAULT_MIGRATION_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const MEGABYTES = 1024 * 1024; // 1 MB

/**
 * Messages sent from the main thread to worker threads.
 */
export interface WorkerMessage {
  type: 'execute' | 'cancel';
  migrationPath?: string;
  stepName?: string;
  context?: MigrationContext;
}

/**
 * Response messages sent from worker threads back to the main thread.
 */
export interface WorkerResponse {
  type: 'result' | 'error';
  result?: MigrationStepResult;
  error?: string;
}

/**
 * Internal state for tracking migrations.
 */
interface ExecutionState {
  context: MigrationContext;
  stepsExecuted: string[];
}

/**
 * Executes schema migrations for a project.
 */
export class MigrationExecutor {
  private logger = getChildLogger({ module: 'MigrationExecutor' });
  private timeoutMs: number;

  /**
   * Constructs instance of MigrationExecutor
   * @param project Project instance to use
   * @param backupDir Backup directory, if any.
   * @param timeoutMS Timeout in milliseconds (defaults to 2 minutes)
   */
  constructor(
    private project: Project,
    private backupDir?: string,
    timeoutMS?: number,
  ) {
    this.timeoutMs = timeoutMS ?? DEFAULT_MIGRATION_TIMEOUT_MS;
  }

  // Helper to create failure result from ExecutionState
  private createFailureResult(
    state: ExecutionState,
    message: string,
    error?: Error,
  ): MigrationResult {
    return {
      success: false,
      message,
      error,
      stepsExecuted: state.stepsExecuted,
    };
  }

  // Execute a single migration step and handle failure
  private async executeStep(
    stepName: string,
    migrationPath: string,
    state: ExecutionState,
  ): Promise<{ success: true } | MigrationResult> {
    const result = await executeStep(
      migrationPath,
      stepName,
      state.context,
      this.timeoutMs,
    );
    state.stepsExecuted.push(stepName);
    if (!result.success) {
      const messagePrefix =
        {
          before: 'Pre-migration check failed',
          backup: 'Backup failed',
          migrate: 'Migration failed',
          after: 'Post-migration step failed',
        }[stepName] || `Step '${stepName}' failed`;

      return this.createFailureResult(
        state,
        `${messagePrefix}: ${result.message || 'Unknown error'}`,
        result.error,
      );
    }
    return { success: true };
  }

  // Execute a single migration.
  private async executeMigration(
    migrationPath: string,
    fromVersion: number,
    toVersion: number,
    updateVersionCallback: (version: number) => Promise<void>,
  ): Promise<MigrationResult> {
    this.logger.info(
      { fromVersion, toVersion },
      `Executing migration from version ${fromVersion} to ${toVersion}`,
    );

    const state: ExecutionState = {
      context: {
        cardRootPath: this.project.paths.cardRootFolder,
        cardsConfigPath: this.project.paths.internalRootFolder,
        fromVersion,
        toVersion,
      },
      stepsExecuted: [],
    };

    try {
      // Load migration to check which steps exist
      const migration = this.loadMigration(toVersion);
      if (!migration) {
        return this.createFailureResult(
          state,
          `Failed to load migration for version ${toVersion}`,
        );
      }

      if (migration.before) {
        const result = await this.executeStep('before', migrationPath, state);
        if (!result.success) return result;
      }

      if (migration.backup && this.backupDir !== undefined) {
        state.context.backupDir = this.backupDir;
        const result = await this.executeStep('backup', migrationPath, state);
        if (!result.success) return result;
      }

      const migrateResult = await this.executeStep(
        'migrate',
        migrationPath,
        state,
      );
      if (!migrateResult.success) return migrateResult;

      // Update schema version in project after successful migration
      await updateVersionCallback(toVersion);
      state.stepsExecuted.push('update-version');

      if (migration.after) {
        const result = await this.executeStep('after', migrationPath, state);
        if (!result.success) return result;
      }

      // Run validation after migration
      state.stepsExecuted.push('validate');
      const validationErrors = await this.validate();
      if (validationErrors) {
        return this.createFailureResult(
          state,
          `Post-migration validation failed: ${validationErrors}`,
        );
      }
      this.logger.info('Post-migration validation passed');

      return {
        success: true,
        message: `Successfully migrated from version ${fromVersion} to ${toVersion}`,
        stepsExecuted: state.stepsExecuted,
      };
    } catch (error) {
      return this.createFailureResult(
        state,
        `Migration threw an exception: ${error}`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  // Checks if pre-migration validation succeeds.
  private async preMigrateValidation(
    fromVersion: number,
    toVersion: number,
    stepsExecuted: string[],
  ): Promise<MigrationResult> {
    const validationErrors = await this.validate();
    if (validationErrors) {
      this.logger.error(
        { errors: validationErrors },
        'Pre-migration validation failed',
      );
      return {
        success: false,
        message: `Pre-migration validation failed. Please fix the following errors before migrating:\n${validationErrors}`,
        stepsExecuted,
      };
    }
    this.logger.info('Pre-migration validation passed');
    return {
      success: true,
      stepsExecuted,
    };
  }

  // Validate the project.
  private async validate() {
    const validator = Validate.getInstance();
    return await validator.validate(this.project.basePath, () => this.project);
  }

  // Validates that migration versions are valid.
  private validateMigrationVersions(
    fromVersion: number,
    toVersion: number,
    stepsExecuted: string[],
  ): MigrationResult {
    const valid = fromVersion < toVersion;
    return {
      success: valid,
      message: valid
        ? undefined
        : `Current version (${fromVersion}) is not lower than target version (${toVersion})`,
      stepsExecuted,
    };
  }

  // Checks if there is enough disk space.
  protected async checkDiskSpace(
    fromVersion: number,
    toVersion: number,
    stepsExecuted: string[],
  ): Promise<MigrationResult> {
    try {
      const internalSize = await folderSize(
        this.project.paths.internalRootFolder,
      );
      const cardRootSize = await folderSize(this.project.paths.cardRootFolder);
      const projectSize = internalSize + cardRootSize;
      const requiredSpace = projectSize * 2;
      const spaceAvailable = await availableSpace(this.project.basePath);
      const projectSizeMB = (projectSize / MEGABYTES).toFixed(2);
      const requiredSpaceMB = (requiredSpace / MEGABYTES).toFixed(2);
      const availableSpaceMB = (spaceAvailable / MEGABYTES).toFixed(2);

      if (spaceAvailable < requiredSpace) {
        return {
          success: false,
          message: `Insufficient disk space. Required: ${requiredSpaceMB} MB, Available: ${availableSpaceMB} MB. Migration needs at least 2x the project size (${projectSizeMB} MB).`,
          stepsExecuted,
        };
      }

      this.logger.info('Disk space check passed');
      return {
        success: true,
        stepsExecuted,
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to check disk space');
      return {
        success: false,
        message: `Failed to check disk space: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
        stepsExecuted,
      };
    }
  }

  /**
   * Discover available migrations between two versions.
   * @param fromVersion Starting version (exclusive)
   * @param toVersion Target version (inclusive)
   * @returns Sorted list of migration version numbers
   */
  protected migrationsAvailable(
    fromVersion: number,
    toVersion: number,
  ): number[] {
    const allVersions = availableMigrations();
    return allVersions.filter(
      (version) => version > fromVersion && version <= toVersion,
    );
  }

  // Validates and discovers available migrations
  protected availableMigrations(
    fromVersion: number,
    toVersion: number,
    stepsExecuted: string[],
  ): MigrationResult & { migrationVersions: number[] } {
    const migrationVersions = this.migrationsAvailable(fromVersion, toVersion);
    const found = migrationVersions.length > 0;
    if (found) {
      this.logger.info(
        { versions: migrationVersions },
        `Found ${migrationVersions.length} migration(s)`,
      );
    }
    return {
      success: found,
      message: found
        ? undefined
        : `No migrations found between version ${fromVersion} and ${toVersion}`,
      stepsExecuted,
      migrationVersions,
    };
  }

  // Load a migration module for a specific version.
  protected loadMigration(version: number): Migration | undefined {
    this.logger.debug({ version }, 'Loading migration');

    try {
      const migrationObject = migration(version);

      if (!migrationObject) {
        this.logger.error({ version }, `Migration not found`);
        return undefined;
      }

      if (typeof migrationObject.migrate !== 'function') {
        throw new Error(
          `Migration ${version} does not implement migrate() function`,
        );
      }

      return migrationObject;
    } catch (error) {
      this.logger.error({ error, version }, `Failed to load migration`);
      return undefined;
    }
  }

  /**
   * Get the file path for a migration worker.
   * @param version Migration version number
   * @returns Path to migration file
   */
  protected migrationWorkerPath(version: number): string {
    const migrationsPackageUrl = import.meta.resolve('@cyberismo/migrations');
    const migrationsIndexPath = fileURLToPath(migrationsPackageUrl);
    const migrationsDistDir = dirname(migrationsIndexPath);
    return join(migrationsDistDir, version.toString(), 'index.js');
  }

  /**
   * Execute all necessary migrations to bring project to target version.
   * @param fromVersion Current project version
   * @param toVersion Target version
   * @param updateVersionCallback Callback to update project schema version after each migration
   * @returns Overall migration result
   */
  public async migrate(
    fromVersion: number,
    toVersion: number,
    updateVersionCallback: (version: number) => Promise<void>,
  ): Promise<MigrationResult> {
    const stepsDone: string[] = [];

    // Step: Validate migration versions
    const versionResult = this.validateMigrationVersions(
      fromVersion,
      toVersion,
      stepsDone,
    );
    if (!versionResult.success) return versionResult;
    stepsDone.push('version-validation');

    // Step: Pre-migration validation
    const validationResult = await this.preMigrateValidation(
      fromVersion,
      toVersion,
      stepsDone,
    );
    if (!validationResult.success) return validationResult;
    stepsDone.push('pre-validation');

    // Step: Check disk space
    const diskSpaceResult = await this.checkDiskSpace(
      fromVersion,
      toVersion,
      stepsDone,
    );
    if (!diskSpaceResult.success) return diskSpaceResult;
    stepsDone.push('disk-space-check');

    // Step: Discover available migrations
    const discoveryResult = this.availableMigrations(
      fromVersion,
      toVersion,
      stepsDone,
    );
    if (!discoveryResult.success) return discoveryResult;
    stepsDone.push('migration-versions');

    const migrationVersions = discoveryResult.migrationVersions;

    // Step(s): Execute migrations in sequence
    let currentVersion = fromVersion;
    try {
      for (const targetVersion of migrationVersions) {
        const migrationPath = this.migrationWorkerPath(targetVersion);

        const result = await this.executeMigration(
          migrationPath,
          currentVersion,
          targetVersion,
          updateVersionCallback,
        );

        if (!result.success) {
          return {
            success: false,
            message: result.message || 'Migration failed',
            error: result.error,
            stepsExecuted: stepsDone,
          };
        }
        stepsDone.push(
          ...result.stepsExecuted.map((step) => `v${targetVersion}:${step}`),
        );

        currentVersion = targetVersion;
        this.logger.info(
          { targetVersion },
          `Migration to version ${targetVersion} completed successfully`,
        );
      }
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : `Migration timeout or error: ${error}`,
        error: error instanceof Error ? error : new Error(String(error)),
        stepsExecuted: stepsDone,
      };
    }
    return {
      success: true,
      message: `Successfully migrated from version ${fromVersion} to ${currentVersion}`,
      stepsExecuted: stepsDone,
    };
  }
}
