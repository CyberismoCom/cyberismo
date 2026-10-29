// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { runMigrationChain, SCHEMA_VERSION } from '@cyberismo/migrations';

import { readModuleConfig } from '../../infra/paths/cards-config.js';

import type { ResolvedModule } from '../resources/changes/replay/module-types.js';

/**
 * Enforce the schema-level invariant on staged module trees before any
 * of them is copied into the project: a tree older than the tool is
 * migrated in place (still in staging), a newer or unversioned tree
 * aborts the whole operation.
 *
 * Migrations run in-process via the chain runner. The staged tree never
 * touches the project; the import flow validates the project after
 * apply. Staged file-source trees may lack `cardRoot`; migrations
 * tolerate its absence.
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
