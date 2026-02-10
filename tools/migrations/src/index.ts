/**
 * Central registry of all available migrations.
 *
 * Each migration is exported with its version number as the key.
 * Data-handler imports this to discover and load migrations.
 */

import type { Migration } from './migration-interfaces.js';
import migration2 from './2/index.js';
import migration3 from './3/index.js';

// Re-export migration interfaces and utilities
export type {
  Migration,
  MigrationContext,
  MigrationStepResult,
} from './migration-interfaces.js';
export { validateProjectStructure } from './migration-interfaces.js';

/**
 * Map of migration version to migration implementation.
 */
export const migrations: Record<number, Migration> = {
  2: migration2,
  3: migration3,
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
