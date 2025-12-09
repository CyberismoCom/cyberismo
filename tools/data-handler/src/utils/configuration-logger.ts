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

import type { Logger } from 'pino';

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
  private static instance: ConfigurationLogger | null = null;
  private readonly paths: ProjectPaths;
  private readonly logger: Logger;
  private readonly logFile: string;

  /**
   * Constructor - Creates an instance of ConfigurationLogger
   * @param projectPath Path to a project root
   * @param logger Logger instance; creates new if missing
   */
  private constructor(
    private projectPath: string,
    logger?: Logger,
  ) {
    this.logger = logger || getChildLogger({ module: 'ConfigurationLogger' });
    this.paths = new ProjectPaths(projectPath);
    this.logFile = this.paths.configurationChangesLog;
  }

  // Internal async method that does the actual logging.
  private async doLog(
    operation: ConfigurationOperation,
    target: string,
    options?: ConfigurationLogOptions,
  ): Promise<void> {
    try {
      const entry: ConfigurationLogEntry = {
        timestamp: new Date().toISOString(),
        operation,
        target,
        parameters: options?.parameters,
      };

      await writeFileSafe(this.logFile, JSON.stringify(entry) + '\n', {
        flag: 'a',
      });

      this.logger.debug(`Logged ${operation} operation for target: ${target}`);
    } catch (error) {
      this.logger.error({ error }, `Failed to log change`);
      throw error;
    }
  }

  /**
   * Gets the path to the configuration log file.
   * @returns Path to the log file
   */
  public get configurationLog(): string {
    return this.logFile;
  }

  /**
   * Clears all log entries.
   * @note Use with caution.
   */
  public async clearLog(): Promise<void> {
    await writeFileSafe(this.logFile, '', 'utf-8');
    this.logger.info('Configuration log cleared');
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
      `Created migration log version: ${version} at ${versionedLogPath}`,
    );

    return versionedLogPath;
  }

  /**
   * Reads all configuration log entries using JSON Lines format.
   * @returns Array of log entries
   */
  public async entries(): Promise<ConfigurationLogEntry[]> {
    try {
      const content = await readFile(this.logFile, 'utf-8');
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
          this.logger.error(`Invalid configuration line: ${line}`);
        }
      }

      return entries;
    } catch (error) {
      this.logger.error({ error }, `Failed to read configuration log`);
      return [];
    }
  }

  /**
   * Gets or creates a singleton instance of ConfigurationLogger.
   * @param projectPath Path to the project root
   * @param logger Logger to use. Configuration logger logs failures to this instance.
   * @returns ConfigurationLogger instance
   */
  public static getInstance(
    projectPath: string,
    logger?: Logger,
  ): ConfigurationLogger {
    if (
      !ConfigurationLogger.instance ||
      ConfigurationLogger.instance.projectPath !== projectPath
    ) {
      ConfigurationLogger.instance = new ConfigurationLogger(
        projectPath,
        logger,
      );
    }
    return ConfigurationLogger.instance;
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
    const logger = ConfigurationLogger.getInstance(projectPath);
    return logger.log(operation, target, options);
  }

  /**
   * Logs a configuration change operation.
   * @note This is designed to be called AFTER the operation succeeds.
   * @param operation The type of operation
   * @param target The target of the operation
   * @param options Additional options for the log entry
   */
  public async log(
    operation: ConfigurationOperation,
    target: string,
    options?: ConfigurationLogOptions,
  ): Promise<void> {
    return this.doLog(operation, target, options).catch((error) => {
      this.logger.warn(`Configuration logging failed: ${error}`);
    });
  }

  /**
   * Reset the singleton instance.
   */
  public static reset() {
    ConfigurationLogger.instance = null;
  }
}
