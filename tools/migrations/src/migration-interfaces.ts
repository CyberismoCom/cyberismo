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

import { existsSync } from 'node:fs';

/**
 * Context passed to migration functions.
 * @param cardRootPath Absolute path to the project's card root directory
 * @param cardsConfigPath Absolute path to the .cards directory
 * @param fromVersion Current schema version before migration
 * @param toVersion Target schema version after migration
 */
export interface MigrationContext {
  cardRootPath: string;
  cardsConfigPath: string;
  fromVersion: number;
  toVersion: number;
}

/**
 * Result of a migration step.
 * @param success true, if migration succeeded
 * @param message optional message about the migration
 * @param error Error object when migration failed.
 */
export interface MigrationStepResult {
  success: boolean;
  message?: string;
  error?: Error;
}

/**
 * Interface that migration programs must implement.
 */
export interface Migration {
  /**
   * Perform the actual migration. This is mandatory to implement.
   * @param context Migration context
   * @returns Result of the migration
   */
  migrate(context: MigrationContext): Promise<MigrationStepResult>;
}

/**
 * Checks that required directories exist before migration.
 *
 * @param context Migration context
 * @returns Result with success status
 */
export function validateProjectStructure(
  context: MigrationContext,
): MigrationStepResult {
  if (!existsSync(context.cardRootPath)) {
    return {
      success: false,
      message: `Card root path does not exist: ${context.cardRootPath}`,
      error: new Error('Missing cardRoot directory'),
    };
  }

  if (!existsSync(context.cardsConfigPath)) {
    return {
      success: false,
      message: `Cards config path does not exist: ${context.cardsConfigPath}`,
      error: new Error('Missing .cards directory'),
    };
  }

  return {
    success: true,
    message: 'Project structure validation passed',
  };
}
