// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Migration } from '../migration-interfaces.js';

/**
 * Migration from schema version 5 to 6
 *
 * Changes:
 * - Introduces the `field` macro, which shows and edits a card field in
 *   card content, optionally of another card (`cardKey`). This requires no
 *   file changes; the version bump fences older tooling from projects that
 *   use the macro.
 *
 * Idempotent: it changes no files.
 */
const migration: Migration = async (context) => {
  console.log(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );
  console.log('Schema changes:');
  console.log('  - Added the field macro');
  console.log('No data transformation required.');
};

export default migration;
