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
import {
  formatSealFileName,
  lastSealedVersion,
} from '../mutations/replay/seal-files.js';
import { ProjectPaths } from '../containers/project/project-paths.js';
import { writeFileSafe, pathExists } from './file-utils.js';

// Entry shapes match the log format shipped in released versions
// (INTDEV-584), so logs written by older versions remain readable and no
// migration is needed.
export const CONFIGURATION_OPERATIONS = [
  'resource_update',
  'resource_delete',
  'resource_rename',
  'project_rename',
] as const;

export type ConfigurationOperation = (typeof CONFIGURATION_OPERATIONS)[number];

export interface ConfigurationLogEntry {
  timestamp: string;
  operation: ConfigurationOperation;
  target: string;
  parameters?: Record<string, unknown>;
}

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
   * Renames current migrationLog.jsonl to migrationLog_<from>_<to>.jsonl,
   * where <from> is the highest previously sealed version (0.0.0 when none)
   * and <to> is the version being sealed.
   * Callers must serialize calls to this method (the read-then-rename is not
   * atomic); bumpVersion's @write lock provides this today.
   * @param projectPath Path to the project root
   * @param version Version being sealed (e.g., "1.1.0")
   * @returns Path to the versioned log file
   */
  public static async createVersion(
    projectPath: string,
    version: string,
  ): Promise<string | null> {
    if (!semver.valid(version)) {
      throw new Error(`Invalid seal version: ${version}`);
    }
    const paths = new ProjectPaths(projectPath);
    const currentLogPath = paths.configurationChangesLog;
    const fromVersion = await lastSealedVersion(paths.migrationLogFolder);
    const versionedLogPath = join(
      paths.migrationLogFolder,
      formatSealFileName(fromVersion, version),
    );

    if (!pathExists(currentLogPath)) {
      // Empty seal: no log file to rename; the version is sealed with no
      // breaking changes. Per the spec, replay against a missing log is
      // a no-op success.
      const logger = getChildLogger({ module: 'ConfigurationLogger' });
      logger.info(`Sealed empty migration log for version: ${version}`);
      return null;
    }

    if (semver.lte(version, fromVersion)) {
      throw new Error(
        `Seal version ${version} must be greater than the last sealed version ${fromVersion}`,
      );
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
          if (entry.timestamp && entry.operation && entry.target) {
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
        `Logged ${entry.operation} operation for target: ${entry.target}`,
      );
    } catch (error) {
      logger.error({ error, ...entry }, `Configuration logging failed`);
    }
  }
}
