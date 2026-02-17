/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { readFile } from 'node:fs/promises';

import { getChildLogger } from './log-utils.js';
import { ProjectPaths } from '../containers/project/project-paths.js';
import { resourceName } from './resource-utils.js';
import { ConfigurationOperation } from './configuration-logger.js';

import type { Project } from '../containers/project.js';
import type { Logger } from 'pino';
import type { ResourceMap } from '../containers/project/resource-cache.js';
import type { ConfigurationLogEntry } from './configuration-logger.js';
import type {
  Operation,
  UpdateOperations,
} from '../resources/resource-object.js';

/**
 * Plays back migration logs to apply transient changes to resources.
 * Reads migrationLog.jsonl files and applies each operation's transient changes.
 */
export class MigrationPlayer {
  private logger: Logger;

  constructor(private project: Project) {
    this.logger = getChildLogger({ module: 'MigrationPlayer' });
  }

  /**
   * Read migration log entries from a specific version.
   * @param version Version number to read migrations from
   * @returns Array of migration log entries
   */
  private async readMigrationLog(
    version: number,
  ): Promise<ConfigurationLogEntry[]> {
    const paths = new ProjectPaths(this.project.basePath);
    const logPath = paths.migrationLogFor(version);

    try {
      const content = await readFile(logPath, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.trim());

      const entries: ConfigurationLogEntry[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as ConfigurationLogEntry;
          if (entry.timestamp && entry.operation && entry.target) {
            entries.push(entry);
          }
        } catch (error) {
          this.logger.warn(
            { error },
            `Failed to parse migration log line: ${line}`,
          );
        }
      }

      return entries;
    } catch (error) {
      this.logger.error(
        { error, version },
        `Failed to read migration log for version ${version}`,
      );
      return [];
    }
  }

  /**
   * Locate a resource based on migration log entry.
   * @param entry Migration log entry containing target and type information
   * @returns Resource object or null if not found
   */
  private async locateResource(
    entry: ConfigurationLogEntry,
  ): Promise<ResourceMap[keyof ResourceMap] | null> {
    try {
      const resourceType = entry.parameters?.type as
        | keyof ResourceMap
        | undefined;
      if (!resourceType) {
        this.logger.warn(
          `No resource type in migration entry for target: ${entry.target}`,
        );
        return null;
      }

      const name = resourceName(entry.target);

      // Check if resource exists in cache or filesystem
      if (!this.project.resources.exists(entry.target)) {
        this.logger.debug(
          `Resource not found in cache: ${entry.target} (${resourceType})`,
        );
        return null;
      }

      // Get the resource using the appropriate method from ResourceHandler
      const resource = this.project.resources.byType(name);
      return resource;
    } catch (error) {
      this.logger.error(
        { error, entry },
        `Failed to locate resource for entry: ${entry.target}`,
      );
      return null;
    }
  }

  /**
   * Apply a single migration log entry.
   * @param entry Migration log entry to apply
   */
  private async applyMigration(entry: ConfigurationLogEntry): Promise<void> {
    this.logger.debug(
      `Applying migration: ${entry.operation} on ${entry.target}`,
    );

    switch (entry.operation) {
      case ConfigurationOperation.RESOURCE_CREATE:
        await this.applyResourceCreate(entry);
        break;

      case ConfigurationOperation.RESOURCE_UPDATE:
        await this.applyResourceUpdate(entry);
        break;

      case ConfigurationOperation.RESOURCE_RENAME:
        await this.applyResourceRename(entry);
        break;

      case ConfigurationOperation.RESOURCE_DELETE:
        await this.applyResourceDelete(entry);
        break;

      case ConfigurationOperation.MODULE_ADD:
      case ConfigurationOperation.MODULE_REMOVE:
      case ConfigurationOperation.PROJECT_RENAME:
        // todo: when a module is removed, check that ALL references from cards and local resources are removed
        // These operations don't require resource-level transient changes
        this.logger.debug(
          `Skipping non-resource operation: ${entry.operation}`,
        );
        break;

      default:
        this.logger.warn(`Unknown migration operation: ${entry.operation}`);
    }
  }

  /**
   * Apply transient changes for resource creation.
   * @param entry Migration log entry
   */
  private async applyResourceCreate(
    entry: ConfigurationLogEntry,
  ): Promise<void> {
    const resource = await this.locateResource(entry);
    if (!resource) {
      this.logger.debug(`Resource not found for create: ${entry.target}`);
      return;
    }

    try {
      // For creation, we don't have a specific key, so we can skip migration
      // or call it with a generic key. Creation typically doesn't need transient changes.
      this.logger.debug(
        `Skipping migration for resource create: ${entry.target}`,
      );
    } catch (error) {
      this.logger.error(
        { error, entry },
        `Failed to apply create migration for: ${entry.target}`,
      );
    }
  }

  /**
   * Apply transient changes for resource update.
   * @param entry Migration log entry
   */
  private async applyResourceUpdate(
    entry: ConfigurationLogEntry,
  ): Promise<void> {
    const resource = await this.locateResource(entry);
    if (!resource) {
      this.logger.debug(`Resource not found for update: ${entry.target}`);
      return;
    }

    try {
      const key = entry.parameters?.key as string | undefined;
      const operationName = entry.parameters?.operation as string | undefined;

      if (!key) {
        this.logger.warn(
          `No key found in migration log for update: ${entry.target}`,
        );
        return;
      }

      // Call the migrate() method with the update key and a minimal operation
      // The operation details aren't stored in the log, but migrate() should be
      // idempotent and work with just the key
      // Create a minimal operation object - the actual implementation
      // should determine what needs to be done based on current state
      const updateKey = { key };
      const operation: Operation<unknown> = {
        name: (operationName || 'change') as UpdateOperations,
        target: null as unknown,
        to: null as unknown,
      } as Operation<unknown>;

      await resource.migrate(updateKey, operation);
      this.logger.info(
        `Applied update migration for: ${entry.target} (key: ${key})`,
      );
    } catch (error) {
      this.logger.error(
        { error, entry },
        `Failed to apply update migration for: ${entry.target}`,
      );
    }
  }

  /**
   * Apply transient changes for resource rename.
   * @param entry Migration log entry
   */
  private async applyResourceRename(
    entry: ConfigurationLogEntry,
  ): Promise<void> {
    // For rename, we need to locate the resource by its NEW name (after rename)
    const resource = await this.locateResource(entry);
    if (!resource) {
      this.logger.debug(`Resource not found for rename: ${entry.target}`);
      return;
    }

    try {
      // For rename, the key is 'name'
      const oldName = entry.parameters?.oldName as string | undefined;
      const newName = entry.parameters?.newName as string | undefined;

      if (!oldName || !newName) {
        this.logger.warn(
          `Missing oldName or newName in migration log for rename: ${entry.target}`,
        );
        return;
      }

      // Call the migrate() method for name change
      const updateKey = { key: 'name' };
      const operation: Operation<string> = {
        name: 'change' as const,
        target: oldName,
        to: newName,
      };

      await resource.migrate(updateKey, operation);
      this.logger.info(
        `Applied rename migration for: ${entry.target} (${oldName} -> ${newName})`,
      );
    } catch (error) {
      this.logger.error(
        { error, entry },
        `Failed to apply rename migration for: ${entry.target}`,
      );
    }
  }

  /**
   * Apply transient changes for resource deletion.
   * @param entry Migration log entry
   */
  private async applyResourceDelete(
    entry: ConfigurationLogEntry,
  ): Promise<void> {
    // For deletion, we may need to update references in other resources
    // This is more complex and may require scanning all resources
    this.logger.debug(
      `Delete migration for: ${entry.target} - handling references`,
    );

    // TODO: Implement cleanup of references to deleted resources
    // This might involve:
    // 1. Finding cards that reference this resource
    // 2. Finding other resources that reference this resource
    // 3. Updating or removing those references
  }

  /**
   * Replay migrations from a specific version.
   * Applies each migration entry's transient changes in order.
   * @param version Version number to replay migrations from
   */
  async replayVersion(version: number): Promise<void> {
    this.logger.info(`Starting migration replay for version ${version}`);

    const entries = await this.readMigrationLog(version);
    if (entries.length === 0) {
      this.logger.info(`No migrations to replay for version ${version}`);
      return;
    }

    this.logger.info(
      `Found ${entries.length} migration entries for version ${version}`,
    );

    let successCount = 0;
    let errorCount = 0;

    for (const entry of entries) {
      try {
        await this.applyMigration(entry);
        successCount++;
      } catch (error) {
        errorCount++;
        this.logger.error(
          { error, entry },
          `Failed to apply migration: ${entry.operation} on ${entry.target}`,
        );
      }
    }

    this.logger.info(
      `Migration replay complete for version ${version}: ${successCount} successful, ${errorCount} errors`,
    );
  }

  /**
   * Replay migrations from current version to target version.
   * Reads the current version from project configuration.
   * @param toVersion Target version number
   */
  async replayToVersion(toVersion: number): Promise<void> {
    const currentVersion = this.project.configuration.version;

    if (currentVersion >= toVersion) {
      this.logger.info(
        `Current version ${currentVersion} is already at or past target version ${toVersion}, no migrations to replay`,
      );
      return;
    }

    this.logger.info(
      `Replaying migrations from version ${currentVersion} to ${toVersion}`,
    );

    // Replay each version from current+1 to target
    for (let version = currentVersion + 1; version <= toVersion; version++) {
      await this.replayVersion(version);
    }

    this.logger.info(
      `Completed migration replay from version ${currentVersion} to ${toVersion}`,
    );
  }
}
