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
 * A schema migration: transforms a project tree in place from
 * `fromVersion` to `toVersion`. Throws on failure.
 */
export type Migration = (context: MigrationContext) => Promise<void>;
