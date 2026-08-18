/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { Migration } from '../migration-interfaces.js';

/**
 * Migration from schema version 2 to 3
 *
 * Changes:
 * - Removes stale migration log files from .cards/local/migrations/
 *
 * Existing projects have migration log entries that predate the new tag-based
 * versioning system. No project has a published version yet, so these logs
 * have no meaningful history. Leaving them would incorrectly trigger the
 * breaking-change gate on the next version bump.
 */
const migration: Migration = async (context) => {
  console.log(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );
  console.log('Schema changes:');
  console.log('  - Removed stale migration logs from pre-versioning era');

  const migrationsDir = join(context.cardsConfigPath, 'local', 'migrations');

  if (!existsSync(migrationsDir)) {
    console.log('No migration log directory found, nothing to clean up.');
    return;
  }

  await rm(migrationsDir, { recursive: true, force: true });
  console.log('Removed .cards/local/migrations/ directory.');
};

export default migration;
