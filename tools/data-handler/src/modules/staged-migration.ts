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

import { runMigrationChain, SCHEMA_VERSION } from '@cyberismo/migrations';

import { readModuleConfig } from '../containers/project/cards-config.js';

import type { ResolvedModule } from './resolve/types.js';

/**
 * Enforce the schema-level invariant on staged module trees before any
 * of them is copied into the project: a tree older than the tool is
 * migrated in place (still in staging), a newer or unversioned tree
 * aborts the whole operation.
 *
 * Migrations run in-process via the chain runner. The staged tree never
 * touches the project, so the interactive executor's workers, backups,
 * disk-space checks and per-step validation are deliberately skipped —
 * the import flow validates the project after apply. Staged file-source
 * trees may lack `cardRoot`; migrations tolerate its absence.
 */
export async function ensureStagedSchemas(
  resolved: ResolvedModule[],
): Promise<void> {
  for (const entry of resolved) {
    const name = entry.declaration.name;
    const config = await readModuleConfig(entry.stagedPath);
    const staged = config.schemaVersion;

    if (staged === undefined) {
      throw new Error(
        `Module '${name}' has no 'schemaVersion' in its cardsConfig.json and cannot be installed.`,
      );
    }
    if (staged > SCHEMA_VERSION) {
      throw new Error(
        `Module '${name}' requires schema version ${staged}; this tool supports up to ${SCHEMA_VERSION}. Upgrade cyberismo, or choose an older module version.`,
      );
    }
    if (staged < SCHEMA_VERSION) {
      await runMigrationChain(entry.stagedPath, staged);
      console.log(
        `Migrated staged module '${name}' from schema ${staged} to ${SCHEMA_VERSION}`,
      );
    }
  }
}
