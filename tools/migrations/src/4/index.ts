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

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  Migration,
  MigrationContext,
  MigrationResult,
} from '../migration-interfaces.js';

/**
 * Migration from schema version 3 to 4
 *
 * Changes:
 * - Strips the legacy `branch` field from each module declaration in
 *   `.cards/local/cardsConfig.json`. Module ref pinning has moved to a
 *   `version` (semver) field; the resolver no longer reads `branch`, so the
 *   field is dead data that round-tripped silently in v3.
 *
 * Idempotent: configs without any `branch` fields are left untouched.
 */
const migration: Migration = {
  async migrate(context: MigrationContext): Promise<MigrationResult> {
    console.log(
      `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
    );

    const configPath = join(
      context.cardsConfigPath,
      'local',
      'cardsConfig.json',
    );

    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw) as {
      modules?: Array<Record<string, unknown>>;
    };

    let stripped = 0;
    for (const m of config.modules ?? []) {
      if ('branch' in m) {
        delete m.branch;
        stripped++;
      }
    }

    const stepsExecuted: string[] = [];
    if (stripped > 0) {
      await writeFile(
        configPath,
        JSON.stringify(config, null, 4) + '\n',
        'utf-8',
      );
      console.log(
        `Removed legacy 'branch' field from ${stripped} module declaration(s).`,
      );
      stepsExecuted.push(
        `Removed 'branch' field from ${stripped} module declaration(s)`,
      );
    } else {
      console.log("No legacy 'branch' fields found in module declarations.");
    }
    stepsExecuted.push('Schema version incremented');

    return {
      success: true,
      message:
        "Schema updated to version 4: removed legacy 'branch' field from module declarations",
      stepsExecuted,
    };
  },
};

export default migration;
