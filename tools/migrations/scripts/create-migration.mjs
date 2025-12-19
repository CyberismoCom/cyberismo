#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';

/**
 * Find the migrations package root
 */
function findMigrationsRoot() {
  // Script is in tools/migrations/scripts, so go up one level to get package root
  const scriptDir = import.meta.dirname;
  const migrationsRoot = join(scriptDir, '..');
  const packageJsonPath = join(migrationsRoot, 'package.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error(`Could not find package.json at ${packageJsonPath}`);
  }

  return migrationsRoot;
}

const MIGRATIONS_ROOT = findMigrationsRoot();
const MIGRATIONS_DIR = join(MIGRATIONS_ROOT, 'src');

/**
 * Get the next migration number by checking existing migration directories
 */
async function nextMigrationNumber() {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrationNumbers = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => parseInt(entry.name, 10));

  if (migrationNumbers.length === 0) {
    console.error(
      'Error: No existing migrations found. The first migration should be version 2.',
    );
    console.error(
      'Please create the initial migration directory manually or ensure migrations exist.',
    );
    process.exit(1);
  }

  return Math.max(...migrationNumbers) + 1;
}

/**
 * Generate the migration template
 */
function generateDefaultMigration(migrationNumber) {
  return `/**
  * Migration from schema version ${migrationNumber - 1} to version ${migrationNumber}.
  *
  * TODO: Describe what this migration does:
  * - List the changes being made
  * - Explain the reason for the migration
  * - Note any breaking changes or important considerations
  */

import { join } from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import type {
  Migration,
  MigrationContext,
  MigrationStepResult,
} from '../migration-interfaces.js';
import { createBackup, validateProjectStructure } from '../migration-interfaces.js';

const migration: Migration = {
  /**
   * Pre-migration validation.
   *
   * Guidelines:
   * - Validate that the project structure is correct
   * - Check prerequisites specific to this migration
   * - Verify that resources needed for migration are accessible
   * - Return { success: false } with error message if migration cannot proceed
   */
  async before(context: MigrationContext): Promise<MigrationStepResult> {
    console.log('Migration ${migrationNumber}: Running pre-migration checks...');

    // Validate basic project structure
    const structureCheck = validateProjectStructure(context);
    if (!structureCheck.success) {
      return structureCheck;
    }

    // TODO: Add your pre-migration validation logic here

    return {
      success: true,
      message: 'Pre-migration checks completed successfully',
    };
  },

  /**
   * Create backup before migration.
   *
   * Guidelines:
   * - Use the standard createBackup() helper
   * - Or implement custom backup logic if needed
   */
  async backup(context: MigrationContext): Promise<MigrationStepResult> {
    return createBackup(context);
  },

  /**
   * Perform the actual migration.
   *
   * Guidelines:
   * - This is the mandatory to implement!
   * - Access resources directly via filesystem (readdir, readFile, writeFile)
   * - cardTypes are in: context.cardsConfigPath/local/cardTypes/<name>.json
   * - workflows are in: context.cardsConfigPath/local/workflows/<name>.json
   * - similarly, for other resources, they are in their own folders.
   * - Log progress for visibility during migration
   * - Handle errors and return descriptive error messages
   * - Be idempotent: migration should handle being run multiple times safely
   */
  async migrate(context: MigrationContext): Promise<MigrationStepResult> {
    console.log(
      \`Migrating from version \${context.fromVersion} to \${context.toVersion}...\`,
    );

    try {
      // Example: Access cardTypes directory
      const cardTypesDir = join(
        context.cardsConfigPath,
        'local',
        'cardTypes',
      );

      // Example: List all cardType files
      const cardTypeFiles = await readdir(cardTypesDir);
      const jsonFiles = cardTypeFiles.filter((f) => f.endsWith('.json'));

      console.log(\`Found \${jsonFiles.length} cardType(s)\`);

      // TODO: Implement your migration logic here
      // For each cardType:
      // const filePath = join(cardTypesDir, fileName);
      // const content = await readFile(filePath, 'utf8');
      // const cardType = JSON.parse(content);
      // // ... modify cardType ...
      // await writeFile(filePath, JSON.stringify(cardType, null, 2), 'utf8');

      console.log(\`Migration ${migrationNumber} completed successfully\`);

      return {
        success: true,
        message: 'Migration completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: \`Migration failed: \${error}\`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  /**
   * Post-migration verification and cleanup.
   *
   * Guidelines:
   * - Verify that migration succeeded (check file changes, data integrity, etc.)
   * - Clean up temporary files or data if needed
   * - Run validation checks on migrated data
   * - Return { success: false } if verification fails
   */
  async after(context: MigrationContext): Promise<MigrationStepResult> {
    console.log(\`Migration ${migrationNumber}: Running post-migration checks...\`);

    // First cleanup

    // Then, validate that project is still in valid state
    const structureCheck = validateProjectStructure(context);
    if (!structureCheck.success) {
      return structureCheck;
    }

    // TODO: Add your post-migration custom verification logic here

    return {
      success: true,
      message: 'Post-migration checks completed successfully',
    };
  },
};

export default migration;
`;
}

/**
 * Create the migration directory and files
 */
async function createMigration() {
  try {
    const migrationNumber = await nextMigrationNumber();
    const migrationDir = join(MIGRATIONS_DIR, migrationNumber.toString());

    if (existsSync(migrationDir)) {
      console.error(
        `Error: Migration directory ${migrationNumber} already exists`,
      );
      process.exit(1);
    }

    await mkdir(migrationDir, { recursive: true });

    const indexPath = join(migrationDir, 'index.ts');
    const template = generateDefaultMigration(migrationNumber);
    await writeFile(indexPath, template, 'utf8');

    console.log(`✓ Created migration ${migrationNumber}`);
    console.log(`  Location: ${migrationDir}`);
    console.log(`  Next steps:`);
    console.log(`    1. Edit ${indexPath} and implement the migration logic`);
    console.log(`    2. Add the migration to src/index.ts in this package`);
    console.log(`    3. Run 'pnpm build' to compile`);
    console.log(`    4. Test the migration in data-handler package`);
  } catch (error) {
    console.error('Error creating migration:', error);
    process.exit(1);
  }
}

createMigration();
