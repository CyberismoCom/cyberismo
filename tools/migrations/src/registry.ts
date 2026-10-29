// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Migration } from './migration-interfaces.js';
import migration2 from './2/index.js';
import migration3 from './3/index.js';
import migration4 from './4/index.js';
import migration5 from './5/index.js';

/**
 * Map of migration version to migration implementation.
 */
export const migrations: Record<number, Migration> = {
  2: migration2,
  3: migration3,
  4: migration4,
  5: migration5,
};

/**
 * Get all available migration versions in sorted order.
 * @returns Array of migration version numbers
 */
export function availableMigrations(): number[] {
  return Object.keys(migrations)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Get a specific migration by version number.
 * @param version The migration version to retrieve
 * @returns The migration implementation or undefined if not found
 */
export function migration(version: number): Migration | undefined {
  return migrations[version];
}

/**
 * The schema version this tool writes: the highest registered
 * migration. Version 1 predates migrations; every later version has
 * one, so the registry is the source of truth.
 */
export const SCHEMA_VERSION = Math.max(...availableMigrations());
