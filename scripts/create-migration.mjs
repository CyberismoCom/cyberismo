#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';

/**
 * Helper for creating migration scaffolding
 * It will:
 * - Create a next folder for migration
 * - Create empty migration functions
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Find the project root by looking for package.json with the correct name
 */
function findProjectRoot() {
  const projectRoot = join(__dirname, '..');
  const packageJsonPath = join(projectRoot, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(`Could not find package.json at ${packageJsonPath}`);
  }

  return projectRoot;
}

const PROJECT_ROOT = findProjectRoot();
const MIGRATIONS_DIR = join(PROJECT_ROOT, 'tools', 'migrations', 'src');

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
import type {
  Migration,
  MigrationContext,
  MigrationStepResult,
} from '@cyberismo/assets';
import { createBackup, validateProjectStructure } from '@cyberismo/assets';

// Dynamic import to avoid circular dependencies
async function getProject(projectPath: string) {
  const { Project } = await import('@cyberismo/data-handler');
  return new Project(projectPath);
}

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
   * - Modify files in cardRoot and .cards directories as needed
   * - cardRoot cards should be mainly modified through resource update() calls (indirect)
   * - Use the Project API to work with resources (cards, cardTypes, workflows, etc.)
   * - Log progress for visibility during migration
   * - Handle errors and return descriptive error messages
   * - Be idempotent: migration should handle being run multiple times safely
   */
  async migrate(context: MigrationContext): Promise<MigrationStepResult> {
    console.log(
      \`Migrating from version \${context.fromVersion} to \${context.toVersion}...\`,
    );

    try {
      const projectPath = join(context.cardsConfigPath, '..');
      const project = await getProject(projectPath);
      const { ResourcesFrom } = await import('@cyberismo/data-handler');

      // TODO: Implement your migration logic here

      console.log('Migration ${migrationNumber} completed successfully');

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
    console.log('Migration ${migrationNumber}: Running post-migration checks...');

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
    console.log(
      `  Next steps: Edit ${indexPath} and implement the migration logic`,
    );
  } catch (error) {
    console.error('Error creating migration:', error);
    process.exit(1);
  }
}

createMigration();
