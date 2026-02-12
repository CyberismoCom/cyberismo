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

import { SCHEMA_VERSION } from '@cyberismo/assets';
import type { MigrationResult } from '@cyberismo/migrations';
import type { Project } from '../containers/project.js';
import { write } from '../utils/rw-lock.js';

/**
 * Command that handles schema migration operations.
 */
export class Migrate {
  /**
   * Constructs instance of Migrate command.
   * @param project Project instance to use.
   */
  constructor(private project: Project) {}

  /**
   * Run migrations to bring project to target schema version.
   * @param toVersion Target version (defaults to latest)
   * @param backupDir Optional directory for backups
   * @param timeoutMilliSeconds Optional timeout in milliseconds (defaults to 2 minutes)
   * @returns Migration result
   */
  @write
  public async migrate(
    toVersion?: number,
    backupDir?: string,
    timeoutMilliSeconds?: number,
  ): Promise<MigrationResult> {
    const currentVersion = this.project.configuration.schemaVersion;
    if (currentVersion === undefined) {
      throw new Error('Project has no schema version set');
    }

    const targetVersion = toVersion ?? SCHEMA_VERSION;

    // Prevent downgrading
    if (targetVersion < currentVersion) {
      throw new Error(
        `Cannot downgrade from version ${currentVersion} to ${targetVersion}. Downgrading is not supported.`,
      );
    }

    // Cannot migrate beyond current application schema
    if (targetVersion > SCHEMA_VERSION) {
      throw new Error(
        `Cannot migrate to version ${targetVersion}. Current application supports up to version ${SCHEMA_VERSION}.`,
      );
    }

    // No migration needed
    if (currentVersion === targetVersion) {
      return {
        success: true,
        message: `Project is already at version ${currentVersion}. No migration needed.`,
        stepsExecuted: [],
      };
    }

    // Prevent skipping migrations when a specific target version is provided
    // If no version specified, migrate to the latest
    if (toVersion !== undefined && toVersion !== SCHEMA_VERSION) {
      // Only allow next sequential version
      if (targetVersion !== currentVersion + 1) {
        throw new Error(
          `Cannot skip to version ${targetVersion}. Project is at version ${currentVersion}, next version is ${currentVersion + 1}. Migrate one version at a time with 'cyberismo migrate ${currentVersion + 1}', or use 'cyberismo migrate' (without a version) to migrate to the latest version.`,
        );
      }
    }

    return await this.project.runMigrations(
      currentVersion,
      targetVersion,
      backupDir,
      timeoutMilliSeconds,
    );
  }
}
