// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { getLogger } from '@cyberismo/node-common/log';

import type { Migration } from '../migration-interfaces.js';

const logger = getLogger({ module: 'migrations' });

/**
 * Migration from schema version 1 to 2
 *
 * Changes:
 * - Added optional 'category' and 'description' fields to cardsConfig.json
 *
 * Since both fields are optional, no data transformation is required.
 */
const migration: Migration = async (context) => {
  logger.info(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );
  logger.info('Schema changes:');
  logger.info('  - Added empty "description" field to cardsConfig.json');
  logger.info('No data transformation required.');
};

export default migration;
