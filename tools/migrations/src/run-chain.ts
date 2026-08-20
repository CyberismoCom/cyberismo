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

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { writeJsonFile } from 'write-json-file';

import { availableMigrations, migration, SCHEMA_VERSION } from './registry.js';

/**
 * Run the contiguous migration chain from `fromVersion` up to
 * SCHEMA_VERSION against a bare `.cards` tree, in-process.
 *
 * Mechanism only: each migration runs directly and `schemaVersion` is
 * stamped into cardsConfig.json after each successful step. Callers own
 * validation policy. The tree may lack `cardRoot`; migrations tolerate
 * its absence.
 */
export async function runMigrationChain(
  root: string,
  fromVersion: number,
): Promise<void> {
  const cardsConfigPath = join(root, '.cards');
  const configFile = join(cardsConfigPath, 'local', 'cardsConfig.json');
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
    try {
      await step({
        cardRootPath: join(root, 'cardRoot'),
        cardsConfigPath,
        fromVersion: current,
        toVersion: v,
      });
    } catch (error) {
      throw new Error(
        `Migration to schema ${v} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    // Raw file I/O: the migration may have rewritten cardsConfig.json on
    // disk, so no in-memory settings object can be trusted to re-save it.
    const raw = JSON.parse(await readFile(configFile, 'utf-8')) as Record<
      string,
      unknown
    >;
    raw.schemaVersion = v;
    await writeJsonFile(configFile, raw, { indent: 4 });
    current = v;
  }
}
