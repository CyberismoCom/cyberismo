// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Public surface of the migrations package: the migration contract,
 * the version registry, and the in-process chain runner.
 */
export type { Migration, MigrationContext } from './migration-interfaces.js';
export {
  availableMigrations,
  migration,
  migrations,
  SCHEMA_VERSION,
} from './registry.js';
export { runMigrationChain } from './run-chain.js';
