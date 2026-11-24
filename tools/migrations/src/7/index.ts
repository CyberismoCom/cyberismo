// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Migration } from '../migration-interfaces.js';

/**
 * Migration from schema version 6 to 7
 *
 * Changes:
 * - Introduces the `createLinks` macro and the `quoted` Handlebars helper.
 *   This requires no file changes; the version bump fences older tooling
 *   from projects that use them.
 *
 * Idempotent: it changes no files.
 */
const migration: Migration = async (context) => {
  console.log(
    `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
  );
  console.log('Schema changes:');
  console.log('  - Added the createLinks macro');
  console.log('No data transformation required.');
};

export default migration;
