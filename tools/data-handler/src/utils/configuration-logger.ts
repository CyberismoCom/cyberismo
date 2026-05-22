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

import { readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import semver from 'semver';

import { getChildLogger } from './log-utils.js';
import { ProjectPaths } from '../containers/project/project-paths.js';
import { writeFileSafe, pathExists } from './file-utils.js';
import { sealedMigrationVersions } from '../modules/inventory.js';
import type {
  Operation,
  ChangeOperation,
} from '../resources/resource-object.js';
import type { ResourceFolderType } from '../interfaces/project-interfaces.js';

export type MigrationEntryKind =
  | 'resource_edit'
  | 'resource_delete'
  | 'resource_rename'
  | 'project_rename';

export interface ConfigurationLogEntry {
  timestamp: string;
  kind: MigrationEntryKind;
  target: string;
  payload: Record<string, unknown>;
}

/** Keys where ALL operations (including remove) are non-breaking. */
export const NON_BREAKING_KEYS = [
  'alwaysVisibleFields',
  'optionallyVisibleFields',
  'transitions',
];

/** Keys where only 'change' is non-breaking — display-only scalars. */
export const NON_BREAKING_CHANGE_KEYS = [
  'displayName',
  'description',
  'category',
  'outboundDisplayName',
  'inboundDisplayName',
];

/**
 * Logger for tracking configuration changes that affect project structure.
 */
export class ConfigurationLogger {
  /**
   * Path to the configuration log file.
   * @param projectPath Path to the project root
   * @returns Path to the log file
   */
  public static logFile(projectPath: string): string {
    const paths = new ProjectPaths(projectPath);
    return paths.configurationChangesLog;
  }

  /**
   * Clears all log entries.
   * @param projectPath Path to the project root
   * @note Use with caution.
   */
  public static async clearLog(projectPath: string): Promise<void> {
    const logFile = ConfigurationLogger.logFile(projectPath);
    try {
      await unlink(logFile);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const logger = getChildLogger({ module: 'ConfigurationLogger' });
    logger.info('Configuration log cleared');
  }

  /**
   * Create a versioned snapshot of the current migration log.
   * Renames current migrationLog.jsonl to migrationLog_<version>.jsonl
   * @param projectPath Path to the project root
   * @param version Version identifier (e.g., "1.0.0", "v2")
   * @returns Path to the versioned log file
   */
  public static async createVersion(
    projectPath: string,
    version: string,
  ): Promise<string | null> {
    const paths = new ProjectPaths(projectPath);
    const currentLogPath = paths.configurationChangesLog;
    const versionedLogPath = join(
      paths.migrationLogFolder,
      `migrationLog_${version}.jsonl`,
    );

    if (!pathExists(currentLogPath)) {
      // Empty seal: no log file to rename; the version is sealed with no
      // breaking changes. Per the spec, replay against a missing log is
      // a no-op success.
      const logger = getChildLogger({ module: 'ConfigurationLogger' });
      logger.info(`Sealed empty migration log for version: ${version}`);
      return null;
    }

    await rename(currentLogPath, versionedLogPath);

    const logger = getChildLogger({ module: 'ConfigurationLogger' });
    logger.info(
      `Created migration to version: ${version} at ${versionedLogPath}`,
    );

    return versionedLogPath;
  }

  /**
   * Reads all configuration log entries using JSON Lines format.
   * @param projectPath Path to the project root
   * @returns Array of log entries
   */
  public static async entries(
    projectPath: string,
  ): Promise<ConfigurationLogEntry[]> {
    const logFile = ConfigurationLogger.logFile(projectPath);
    const logger = getChildLogger({ module: 'ConfigurationLogger' });

    try {
      const content = await readFile(logFile, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.trim());

      const entries: ConfigurationLogEntry[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as ConfigurationLogEntry;
          if (entry.timestamp && entry.kind && entry.target) {
            entries.push(entry);
          }
        } catch {
          logger.error(`Invalid configuration line: ${line}`);
        }
      }

      return entries;
    } catch (error) {
      logger.error({ error }, `Failed to read configuration log`);
      return [];
    }
  }

  /**
   * Return the highest semver among the existing sealed migration log files
   * for the given project, or null if there are none.
   * @param projectPath Path to the project root
   */
  public static async previousSealedVersion(
    projectPath: string,
  ): Promise<string | null> {
    const folder = new ProjectPaths(projectPath).migrationLogFolder;
    const versions = await sealedMigrationVersions(folder);
    if (versions.length === 0) return null;
    return versions.sort(semver.compare).at(-1) ?? null;
  }

  /**
   * Determine whether the move from `previousVersion` to `newVersion` is a
   * semver patch bump. Returns false when either argument is null or invalid.
   */
  public static isPatchBump(
    previousVersion: string | null,
    newVersion: string,
  ): boolean {
    if (!previousVersion) return false;
    if (!semver.valid(previousVersion) || !semver.valid(newVersion))
      return false;
    return semver.diff(previousVersion, newVersion) === 'patch';
  }

  /**
   * Check if a configuration log exists for the given project path.
   * @param projectPath Path to the project root
   * @returns True if log file exists
   */
  public static hasBreakingChanges(projectPath: string): boolean {
    const logPath = new ProjectPaths(projectPath).configurationChangesLog;
    return pathExists(logPath);
  }

  /**
   * Log a configuration change operation.
   * @note This is designed to be called AFTER the operation succeeds.
   */
  public static async log(
    projectPath: string,
    entry: Omit<ConfigurationLogEntry, 'timestamp'>,
  ): Promise<void> {
    const logFile = ConfigurationLogger.logFile(projectPath);
    const logger = getChildLogger({ module: 'ConfigurationLogger' });

    try {
      const full: ConfigurationLogEntry = {
        timestamp: new Date().toISOString(),
        ...entry,
      };

      await writeFileSafe(logFile, JSON.stringify(full) + '\n', {
        flag: 'a',
      });

      logger.debug(
        `Logged ${entry.kind} operation for target: ${entry.target}`,
      );
    } catch (error) {
      logger.error({ error, ...entry }, `Configuration logging failed`);
    }
  }

  /**
   * For array-of-objects keys: which properties are "identity" (breaking if changed).
   * If a 'change' op only modifies non-identity properties, it's non-breaking.
   * Keys not listed here → all changes are breaking by default.
   */
  private static readonly IDENTITY_PROPERTIES: Record<string, string[]> = {
    enumValues: ['enumValue'],
    states: ['name'],
    customFields: ['name', 'isCalculated'],
  };

  private static isNonBreakingArrayChange<T>(
    key: string,
    op: ChangeOperation<T>,
  ): boolean {
    const identityProps = ConfigurationLogger.IDENTITY_PROPERTIES[key];
    if (!identityProps) return false;
    const target = op.target as Record<string, unknown>;
    const to = op.to as Record<string, unknown>;
    return !identityProps.some(
      (prop) => JSON.stringify(target[prop]) !== JSON.stringify(to[prop]),
    );
  }

  public static async logResourceUpdate<T>(
    projectPath: string,
    target: string,
    resourceType: ResourceFolderType,
    op: Operation<T>,
    key: string,
  ): Promise<void> {
    if (op.name === 'add' || op.name === 'rank') return;
    if (NON_BREAKING_KEYS.includes(key)) return;
    if (op.name === 'change') {
      if (NON_BREAKING_CHANGE_KEYS.includes(key)) return;
      if (ConfigurationLogger.isNonBreakingArrayChange(key, op)) return;
    }
    await ConfigurationLogger.log(projectPath, {
      kind: 'resource_edit',
      target,
      payload: { type: resourceType, operation: op, key },
    });
  }

  public static async logResourceRename(
    projectPath: string,
    target: string,
    resourceType: ResourceFolderType,
    op: ChangeOperation<string>,
  ): Promise<void> {
    await ConfigurationLogger.log(projectPath, {
      kind: 'resource_rename',
      target,
      payload: { type: resourceType, newName: op.to },
    });
  }

  public static async logResourceDelete(
    projectPath: string,
    target: string,
    resourceType: ResourceFolderType,
  ): Promise<void> {
    await ConfigurationLogger.log(projectPath, {
      kind: 'resource_delete',
      target,
      payload: { type: resourceType },
    });
  }
}
