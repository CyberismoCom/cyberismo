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

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { availableMigrations, migration } from '@cyberismo/migrations';
import { getChildLogger } from '../utils/log-utils.js';
import type {
  Migration,
  MigrationContext,
  MigrationStepResult,
} from '@cyberismo/migrations';
import type { Project } from '../containers/project.js';

/**
 * Executes schema migrations for a project.
 */
export class MigrationExecutor {
  private logger = getChildLogger({ module: 'MigrationExecutor' });

  constructor(private project: Project) {}

  // Execute a single migration.
  private async executeMigration(
    migrationObj: Migration,
    fromVersion: number,
    toVersion: number,
  ): Promise<MigrationStepResult> {
    this.logger.info(
      { fromVersion, toVersion },
      `Executing migration from version ${fromVersion} to ${toVersion}`,
    );

    const context: MigrationContext = {
      cardRootPath: this.project.paths.cardRootFolder,
      cardsConfigPath: this.project.paths.internalRootFolder,
      fromVersion,
      toVersion,
    };

    try {
      const result = await migrationObj.migrate(context);

      if (!result.success) {
        return {
          success: false,
          message: `Migration failed: ${result.message || 'Unknown error'}`,
          error: result.error,
        };
      }

      // Update schema version on disk, preserving any changes made by the migration
      const configPath = join(
        this.project.paths.internalRootFolder,
        'local',
        'cardsConfig.json',
      );
      const raw = await readFile(configPath, 'utf-8');
      const config = JSON.parse(raw);
      config.schemaVersion = toVersion;
      await writeFile(
        configPath,
        JSON.stringify(config, null, 4) + '\n',
        'utf-8',
      );

      return {
        success: true,
        message: `Successfully migrated from version ${fromVersion} to ${toVersion}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Migration threw an exception: ${error}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  // Validates that migration versions are valid.
  private validateMigrationVersions(
    fromVersion: number,
    toVersion: number,
  ): MigrationStepResult {
    const valid = fromVersion < toVersion;
    return {
      success: valid,
      message: valid
        ? undefined
        : `Current version (${fromVersion}) is not lower than target version (${toVersion})`,
    };
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
  ): MigrationStepResult & { migrationVersions: number[] } {
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
   * Execute all necessary migrations to bring project to target version.
   * @param fromVersion Current project version
   * @param toVersion Target version
   * @returns Overall migration result
   */
  public async migrate(
    fromVersion: number,
    toVersion: number,
  ): Promise<MigrationStepResult> {
    // Step: Validate migration versions
    const versionResult = this.validateMigrationVersions(
      fromVersion,
      toVersion,
    );
    if (!versionResult.success) return versionResult;

    // Step: Discover available migrations
    const discoveryResult = this.availableMigrations(fromVersion, toVersion);
    if (!discoveryResult.success) return discoveryResult;

    const migrationVersions = discoveryResult.migrationVersions;

    // Step(s): Execute migrations in sequence
    let currentVersion = fromVersion;
    try {
      for (const targetVersion of migrationVersions) {
        const migrationObj = this.loadMigration(targetVersion);
        if (!migrationObj) {
          return {
            success: false,
            message: `Failed to load migration for version ${targetVersion}`,
          };
        }

        const result = await this.executeMigration(
          migrationObj,
          currentVersion,
          targetVersion,
        );

        if (!result.success) {
          return {
            success: false,
            message: result.message || 'Migration failed',
            error: result.error,
          };
        }

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
          error instanceof Error ? error.message : `Migration error: ${error}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    return {
      success: true,
      message: `Successfully migrated from version ${fromVersion} to ${currentVersion}`,
    };
  }
}
