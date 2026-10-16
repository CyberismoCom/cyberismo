// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { Migration } from '../migration-interfaces.js';

// Pre-replay seals carry a single version (migrationLog_<version>.jsonl).
// Lineage-named seals (migrationLog_<from>_<to>.jsonl) must not match.
const OLD_SEAL_NAME = /^migrationLog_\d+\.\d+\.\d+\.jsonl$/;

/**
 * Migration from schema version 4 to 5
 *
 * Changes:
 * - Removes pre-replay migration log snapshots
 *   (`migrationLog_<version>.jsonl`) from `.cards/local/migrations/` and
 *   from every installed module tree's `.cards/modules/<prefix>/migrations/`.
 *   The replay system reads only lineage-named seals
 *   (`migrationLog_<from>_<to>.jsonl`) and ignores the old single-version
 *   files, so they are dead data.
 * - Introduces calculated custom field override support: card types may
 *   declare `enableOverride` on calculated custom fields, and cards may store
 *   override values for them. This requires no file changes; the version bump
 *   fences older tooling from projects that use the feature.
 * - Custom fields no longer require null placeholders: absent and null both
 *   mean "no value", card-type field changes leave stored values dormant, and
 *   'cyberismo clean' removes them. This requires no file changes; the version
 *   bump fences older tooling (which requires the placeholders) from projects
 *   written without them.
 *
 * Idempotent: a project without old-format snapshots is left untouched.
 */
const migration: Migration = async (context) => {
  console.log(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );

  const sweepTargets = [join(context.cardsConfigPath, 'local', 'migrations')];
  const modulesFolder = join(context.cardsConfigPath, 'modules');
  for (const name of await readdirOrEmpty(modulesFolder)) {
    sweepTargets.push(join(modulesFolder, name, 'migrations'));
  }

  let removed = 0;
  for (const folder of sweepTargets) {
    const entries = await readdirOrEmpty(folder);
    for (const name of entries.filter((n) => OLD_SEAL_NAME.test(n))) {
      await rm(join(folder, name));
      console.log(`Removed pre-replay migration log snapshot '${name}'.`);
      removed++;
    }
  }
  if (removed === 0) {
    console.log('No pre-replay migration log snapshots found.');
  }
};

async function readdirOrEmpty(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    return [];
  }
}

export default migration;
