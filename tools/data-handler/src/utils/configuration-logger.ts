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

import { getChildLogger } from './log-utils.js';
import { ProjectPaths } from '../containers/project/project-paths.js';
import { writeFileSafe, pathExists } from './file-utils.js';
import type {
  Operation,
  ChangeOperation,
} from '../resources/resource-object.js';
import type { ResourceFolderType } from '../interfaces/project-interfaces.js';

/**
 * Enum for configuration change operation types.
 */
export enum ConfigurationOperation {
  MODULE_REMOVE = 'module_remove',
  PROJECT_RENAME = 'project_rename',
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
  ): Promise<string> {
    const paths = new ProjectPaths(projectPath);
    const currentLogPath = paths.configurationChangesLog;
    const versionedLogPath = join(
      paths.migrationLogFolder,
      `migrationLog_${version}.jsonl`,
    );

    if (!pathExists(currentLogPath)) {
      throw new Error('No current migration log exists to version');
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
  public static hasBreakingChanges(projectPath: string): boolean {
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

  /** Keys where ALL operations (including remove) are non-breaking. */
  private static readonly NON_BREAKING_KEYS = [
    'alwaysVisibleFields',
    'optionallyVisibleFields',
    'transitions',
  ];

  /** Keys where only 'change' is non-breaking — display-only scalars. */
  private static readonly NON_BREAKING_CHANGE_KEYS = [
    'displayName',
    'description',
    'category',
    'outboundDisplayName',
    'inboundDisplayName',
  ];

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

  private static isNonBreakingArrayChange(
    key: string,
    op: ChangeOperation<Record<string, unknown>>,
  ): boolean {
    const identityProps = ConfigurationLogger.IDENTITY_PROPERTIES[key];
    if (!identityProps) return false;
    return !identityProps.some(
      (prop) => JSON.stringify(op.target[prop]) !== JSON.stringify(op.to[prop]),
    );
  }

  /**
   * Log a resource operation if it represents a breaking change.
   * Non-breaking operations (create, additive updates, display-only changes) are skipped.
   */
  public static async logResourceOperation<Type>(
    projectPath: string,
    target: string,
    resourceType: ResourceFolderType,
    operationType: 'create' | 'delete' | 'update' | 'rename',
    op?: Operation<Type>,
    key?: string,
  ): Promise<void> {
    let configOperation: ConfigurationOperation;
    const parameters: Record<string, unknown> = { type: resourceType };

    switch (operationType) {
      case 'create':
        return;
      case 'delete':
        configOperation = ConfigurationOperation.RESOURCE_DELETE;
        break;
      case 'update':
        if (op?.name === 'add' || op?.name === 'rank') return;
        if (key && ConfigurationLogger.NON_BREAKING_KEYS.includes(key)) return;
        if (op?.name === 'change') {
          if (key && ConfigurationLogger.NON_BREAKING_CHANGE_KEYS.includes(key))
            return;
          if (
            key &&
            ConfigurationLogger.isNonBreakingArrayChange(
              key,
              op as ChangeOperation<Record<string, unknown>>,
            )
          )
            return;
        }
        configOperation = ConfigurationOperation.RESOURCE_UPDATE;
        if (op) parameters.operation = op;
        if (key) parameters.key = key;
        break;
      case 'rename':
        configOperation = ConfigurationOperation.RESOURCE_RENAME;
        if (op) parameters.operation = op;
        break;
      default:
        throw new Error(`Unknown operation type: ${operationType}`);
    }

    await ConfigurationLogger.log(projectPath, configOperation, target, {
      parameters,
    });
  }
}
