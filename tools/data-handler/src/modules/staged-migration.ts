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

import { writeJsonFile as atomicWriteJson } from 'write-json-file';

import { SCHEMA_VERSION } from '@cyberismo/assets';
import { availableMigrations, migration } from '@cyberismo/migrations';

import { ProjectPaths } from '../containers/project/project-paths.js';
import { readModuleConfig } from '../containers/project/cards-config.js';
import { getChildLogger } from '../utils/log-utils.js';
import { readJsonFile } from '../utils/json.js';

import type { ResolvedModule } from './resolve/types.js';

const logger = getChildLogger({ module: 'staged-migration' });

/**
 * Enforce the schema-level invariant on staged module trees before any
 * of them is copied into the project: a tree older than the tool is
 * migrated in place (still in staging), a newer or unversioned tree
 * aborts the whole operation.
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
      await migrateStagedTree(entry.stagedPath, staged);
      console.log(
        `Migrated staged module '${name}' from schema ${staged} to ${SCHEMA_VERSION}`,
      );
    }
  }
}

/**
 * Run schema migrations against a staged module checkout, in-process.
 *
 * The staged tree never touches the project, so the interactive
 * executor's workers, backups, disk-space checks and per-step validation
 * are deliberately skipped — the import flow validates the project after
 * apply. Staged file-source trees may lack `cardRoot`; migrations
 * tolerate its absence.
 */
export async function migrateStagedTree(
  stagedRoot: string,
  fromVersion: number,
): Promise<void> {
  const paths = new ProjectPaths(stagedRoot);
  const versions = availableMigrations().filter(
    (v) => v > fromVersion && v <= SCHEMA_VERSION,
  );

  // The chain must be contiguous from fromVersion+1 up to SCHEMA_VERSION.
  let expected = fromVersion + 1;
  for (const v of versions) {
    if (v !== expected) {
      throw new Error(
        `No migration path from schema ${fromVersion} to ${SCHEMA_VERSION}: migration ${expected} is missing`,
      );
    }
    expected = v + 1;
  }
  if (expected !== SCHEMA_VERSION + 1) {
    throw new Error(
      `No migration path from schema ${fromVersion} to ${SCHEMA_VERSION}: migration ${expected} is missing`,
    );
  }

  let current = fromVersion;
  for (const v of versions) {
    const step = migration(v);
    if (!step) {
      throw new Error(`Migration ${v} is not registered`);
    }
    logger.info(
      { stagedRoot, fromVersion: current, toVersion: v },
      'migrating staged tree',
    );
    const result = await step.migrate({
      cardRootPath: paths.cardRootFolder,
      cardsConfigPath: paths.internalRootFolder,
      fromVersion: current,
      toVersion: v,
    });
    if (!result.success) {
      throw new Error(
        `Migration to schema ${v} failed for staged tree: ${result.message ?? 'unknown error'}`,
      );
    }
    // Raw file I/O: the migration may have rewritten cardsConfig.json on
    // disk, so no in-memory settings object can be trusted to re-save it.
    const raw = await readJsonFile(paths.configurationFile);
    if (!raw) {
      throw new Error(`Cannot read ${paths.configurationFile}`);
    }
    raw.schemaVersion = v;
    await atomicWriteJson(paths.configurationFile, raw, { indent: 4 });
    current = v;
  }
}
