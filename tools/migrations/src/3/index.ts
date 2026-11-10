// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { getLogger } from '@cyberismo/node-common/log';

import type { Migration } from '../migration-interfaces.js';

const logger = getLogger({ module: 'migrations' });

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
  logger.info(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );
  logger.info('Schema changes:');
  logger.info('  - Removed stale migration logs from pre-versioning era');

  const migrationsDir = join(context.cardsConfigPath, 'local', 'migrations');

  if (!existsSync(migrationsDir)) {
    logger.info('No migration log directory found, nothing to clean up.');
    return;
  }

  await rm(migrationsDir, { recursive: true, force: true });
  logger.info('Removed .cards/local/migrations/ directory.');
};

export default migration;
