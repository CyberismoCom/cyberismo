// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Context passed to migration functions.
 * @param cardRootPath Absolute path to the project's card root directory
 * @param cardsConfigPath Absolute path to the .cards directory
 * @param fromVersion Current schema version before migration
 * @param toVersion Target schema version after migration
 */
export interface MigrationContext {
  cardRootPath: string;
  cardsConfigPath: string;
  fromVersion: number;
  toVersion: number;
}

/**
 * A schema migration: transforms a project tree in place from
 * `fromVersion` to `toVersion`. Throws on failure.
 */
export type Migration = (context: MigrationContext) => Promise<void>;
