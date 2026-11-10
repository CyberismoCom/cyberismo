// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getLogger } from '@cyberismo/node-common/log';

import type { Migration } from '../migration-interfaces.js';

const logger = getLogger({ module: 'migrations' });

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
const migration: Migration = async (context) => {
  logger.info(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );

  const configPath = join(context.cardsConfigPath, 'local', 'cardsConfig.json');

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

  if (stripped > 0) {
    await writeFile(
      configPath,
      JSON.stringify(config, null, 4) + '\n',
      'utf-8',
    );
    logger.info(
      `Removed legacy 'branch' field from ${stripped} module declaration(s).`,
    );
  } else {
    logger.info("No legacy 'branch' fields found in module declarations.");
  }
};

export default migration;
