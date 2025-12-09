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

import { readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { getChildLogger } from './log-utils.js';
import { ProjectPaths } from '../containers/project/project-paths.js';
import { writeFileSafe, pathExists } from './file-utils.js';

/**
 * Enum for configuration change operation types.
 */
export enum ConfigurationOperation {
  MODULE_ADD = 'module_add',
  MODULE_REMOVE = 'module_remove',
  PROJECT_RENAME = 'project_rename',
  RESOURCE_CREATE = 'resource_create',
  RESOURCE_DELETE = 'resource_delete',
  RESOURCE_RENAME = 'resource_rename',
  RESOURCE_UPDATE = 'resource_update',
}

/**
 * Individual log entry representing a single configuration change.
 * @param timestamp Timestamp when the operation occurred (ISO string)
 * @param operation Type of operation performed
 * @param target Target of the operation
 * @param parameters Additional parameters specific to the operation
 */
export interface ConfigurationLogEntry {
  timestamp: string;
  operation: ConfigurationOperation;
  target: string;
  parameters?: Record<string, unknown>;
}

/**
 * Options for logging configuration changes.
 * @param parameters  Additional parameters to store with the operation
 */
export interface ConfigurationLogOptions {
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
    await writeFileSafe(logFile, '', 'utf-8');
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
  ): Promise<string> {
    const paths = new ProjectPaths(projectPath);
    const currentLogPath = paths.configurationChangesLog;
    const versionedLogPath = join(
      paths.migrationLogFolder,
      `migrationLog_${version}.jsonl`,
    );

    // Only create version if current log exists and has content
    if (!pathExists(currentLogPath)) {
      throw new Error('No current migration log exists to version');
    }

    const content = await readFile(currentLogPath, 'utf-8');
    if (!content.trim()) {
      throw new Error('Current migration log is empty');
    }

    // Rename current to versioned
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
  public static hasLog(projectPath: string): boolean {
    const logPath = new ProjectPaths(projectPath).configurationChangesLog;
    return pathExists(logPath);
  }

  /**
   * Log a configuration change operation.
   * @note This is designed to be called AFTER the operation succeeds.
   * @param projectPath Path to the project root
   * @param operation The type of operation
   * @param target The target of the operation
   * @param options Additional options for the log entry
   */
  public static async log(
    projectPath: string,
    operation: ConfigurationOperation,
    target: string,
    options?: ConfigurationLogOptions,
  ): Promise<void> {
    const logFile = ConfigurationLogger.logFile(projectPath);
    const logger = getChildLogger({ module: 'ConfigurationLogger' });

    try {
      const entry: ConfigurationLogEntry = {
        timestamp: new Date().toISOString(),
        operation,
        target,
        parameters: options?.parameters,
      };

      await writeFileSafe(logFile, JSON.stringify(entry) + '\n', {
        flag: 'a',
      });

      logger.debug(`Logged ${operation} operation for target: ${target}`);
    } catch (error) {
      logger.error(
        { error, operation, target },
        `Configuration logging failed`,
      );
    }
  }
}
