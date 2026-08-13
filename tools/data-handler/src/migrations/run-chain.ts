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
import { getChildLogger } from '../utils/log-utils.js';
import { readJsonFile } from '../utils/json.js';

const logger = getChildLogger({ module: 'run-migration-chain' });

/**
 * Run the contiguous migration chain from `fromVersion` up to
 * SCHEMA_VERSION against a bare `.cards` tree, in-process.
 *
 * Mechanism only: each migration's `migrate` runs directly — no workers,
 * timeouts, backups or validation — and `schemaVersion` is stamped into
 * cardsConfig.json after each successful step. Callers own validation
 * policy. The tree may lack `cardRoot`; migrations tolerate its absence.
 */
export async function runMigrationChain(
  root: string,
  fromVersion: number,
): Promise<void> {
  const paths = new ProjectPaths(root);
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
      { root, fromVersion: current, toVersion: v },
      'running migration step',
    );
    const result = await step.migrate({
      cardRootPath: paths.cardRootFolder,
      cardsConfigPath: paths.internalRootFolder,
      fromVersion: current,
      toVersion: v,
    });
    if (!result.success) {
      throw new Error(
        `Migration to schema ${v} failed: ${result.message ?? 'unknown error'}`,
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
