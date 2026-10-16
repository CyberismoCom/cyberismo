// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Migration } from '../migration-interfaces.js';

/**
 * Migration from schema version 1 to 2
 *
 * Changes:
 * - Added optional 'category' and 'description' fields to cardsConfig.json
 *
 * Since both fields are optional, no data transformation is required.
 */
const migration: Migration = async (context) => {
  console.log(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );
  console.log('Schema changes:');
  console.log('  - Added empty "description" field to cardsConfig.json');
  console.log('No data transformation required.');
};

export default migration;
