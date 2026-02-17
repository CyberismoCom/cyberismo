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
import { randomUUID } from 'node:crypto';

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
  id: string;
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
   * @param version Version number whose migration log to target
   * @returns Path to the log file
   */
  public static logFile(projectPath: string, version: number = 1): string {
    return new ProjectPaths(projectPath).migrationLogFor(version);
  }

  /**
   * Clears all log entries.
   * @param projectPath Path to the project root
   * @param version Version number whose migration log to clear
   * @note Use with caution.
   */
  public static async clearLog(
    projectPath: string,
    version: number = 1,
  ): Promise<void> {
    const logFile = ConfigurationLogger.logFile(projectPath, version);
    await writeFileSafe(logFile, '', 'utf-8');
    const logger = getChildLogger({ module: 'ConfigurationLogger' });
    logger.info('Configuration log cleared');
  }

  /**
   * Reads all configuration log entries using JSON Lines format.
   * @param projectPath Path to the project root
   * @param version Version number whose migration log to read
   * @returns Array of log entries
   */
  public static async entries(
    projectPath: string,
    version: number = 1,
  ): Promise<ConfigurationLogEntry[]> {
    const logFile = ConfigurationLogger.logFile(projectPath, version);
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
   * @param version Version number to check
   * @returns True if log file exists
   */
  public static hasLog(projectPath: string, version: number = 1): boolean {
    const logPath = ConfigurationLogger.logFile(projectPath, version);
    return pathExists(logPath);
  }

  /**
   * Returns the UUID of the last entry in the migration log for the given version.
   * @param projectPath Path to the project root
   * @param version Version number whose migration log to read
   * @returns UUID of the last entry, or undefined if the log is empty
   */
  public static async latestEntryId(
    projectPath: string,
    version: number = 1,
  ): Promise<string | undefined> {
    const logFile = ConfigurationLogger.logFile(projectPath, version);
    const logger = getChildLogger({ module: 'ConfigurationLogger' });

    try {
      const content = await readFile(logFile, 'utf-8');
      const lines = content
        .trim()
        .split('\n')
        .filter((line) => line.trim());

      if (lines.length === 0) {
        return undefined;
      }

      const lastLine = lines[lines.length - 1];
      const entry = JSON.parse(lastLine) as ConfigurationLogEntry;
      return entry.id;
    } catch (error) {
      logger.error({ error }, `Failed to read latest entry ID`);
      return undefined;
    }
  }

  /**
   * Log a configuration change operation.
   * @note This is designed to be called AFTER the operation succeeds.
   * @param projectPath Path to the project root
   * @param operation The type of operation
   * @param target The target of the operation
   * @param options Additional options for the log entry
   * @param version Version number whose migration log to write to
   */
  public static async log(
    projectPath: string,
    operation: ConfigurationOperation,
    target: string,
    options?: ConfigurationLogOptions,
    version: number = 1,
  ): Promise<void> {
    const logFile = ConfigurationLogger.logFile(projectPath, version);
    const logger = getChildLogger({ module: 'ConfigurationLogger' });

    try {
      const entry: ConfigurationLogEntry = {
        id: randomUUID(),
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
