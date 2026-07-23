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

import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  Migration,
  MigrationContext,
  MigrationResult,
} from '../migration-interfaces.js';

// Pre-replay seals carry a single version (migrationLog_<version>.jsonl).
// Lineage-named seals (migrationLog_<from>_<to>.jsonl) must not match.
const OLD_SEAL_NAME = /^migrationLog_\d+\.\d+\.\d+\.jsonl$/;

/**
 * Migration from schema version 4 to 5
 *
 * Changes:
 * - Removes pre-replay migration log snapshots
 *   (`.cards/local/migrations/migrationLog_<version>.jsonl`). The replay
 *   system reads only lineage-named seals
 *   (`migrationLog_<from>_<to>.jsonl`) and ignores the old single-version
 *   files, so they are dead data.
 * - Introduces calculated custom field override support: card types may
 *   declare `enableOverride` on calculated custom fields, and cards may store
 *   override values for them. This requires no file changes; the version bump
 *   fences older tooling from projects that use the feature.
 *
 * Idempotent: a project without old-format snapshots is left untouched.
 */
const migration: Migration = {
  async migrate(context: MigrationContext): Promise<MigrationResult> {
    console.log(
      `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
    );

    const migrationsFolder = join(
      context.cardsConfigPath,
      'local',
      'migrations',
    );

    let entries: string[] = [];
    try {
      entries = await readdir(migrationsFolder);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    const stepsExecuted: string[] = [];
    const oldSnapshots = entries.filter((name) => OLD_SEAL_NAME.test(name));
    for (const name of oldSnapshots) {
      await rm(join(migrationsFolder, name));
      console.log(`Removed pre-replay migration log snapshot '${name}'.`);
      stepsExecuted.push(`Removed pre-replay migration log snapshot ${name}`);
    }
    if (oldSnapshots.length === 0) {
      console.log('No pre-replay migration log snapshots found.');
    }
    stepsExecuted.push('Schema version incremented');

    return {
      success: true,
      message:
        'Schema updated to version 5: removed pre-replay migration log snapshots (replay reads only lineage-named seals) and enabled calculated field override support',
      stepsExecuted,
    };
  },
};

export default migration;
