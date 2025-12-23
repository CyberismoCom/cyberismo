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

import type {
  Migration,
  MigrationContext,
  MigrationResult,
} from '../migration-interfaces.js';

/**
 * Migration from schema version 1 to 2
 *
 * Changes:
 * - Added optional 'category' and 'description' fields to cardsConfig.json
 *
 * Since both fields are optional, no data transformation is required.
 */
const migration: Migration = {
  /**
   * Perform the migration from version 1 to 2.
   * This is an empty migration - the schema changes are additive only.
   *
   * @param context Migration context
   * @returns Migration result
   */
  async migrate(context: MigrationContext): Promise<MigrationResult> {
    console.log(
      `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
    );
    console.log('Schema changes:');
    console.log('  - Added empty "description" field to cardsConfig.json');
    console.log('No data transformation required.');

    return {
      success: true,
      message:
        'Schema updated to version 2: support for "category" and "description" fields in project configuration',
      stepsExecuted: ['Schema version incremented'],
    };
  },
};

export default migration;
