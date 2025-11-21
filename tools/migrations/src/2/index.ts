/**
 * Example migration from schema version 1 to version 2.
 *
 * This migration demonstrates:
 * - Accessing local cardTypes via filesystem
 * - Reading and writing JSON files directly
 * - Using the Migration interface with before(), backup(), migrate(), and after() functions
 */

import { join } from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import type {
  Migration,
  MigrationContext,
  MigrationStepResult,
} from '../migration-interfaces.js';
import {
  createBackup,
  validateProjectStructure,
} from '../migration-interfaces.js';
import { existsSync } from 'node:fs';

// Actual example migration implementation.
// Note that this is very verbose; actual migrations will be a lot smaller.
const migration: Migration = {
  /**
   * Pre-migration validation.
   * Check if the project is in a valid state before migrating.
   */
  async before(context: MigrationContext): Promise<MigrationStepResult> {
    console.log(
      'Migration: This migration adds "MIGRATED:" to card type descriptions',
    );

    // Validate basic project structure
    const structureCheck = validateProjectStructure(context);
    if (!structureCheck.success) {
      return structureCheck;
    }

    // Check that we can access the cardTypes directory
    try {
      const cardTypesDir = join(context.cardsConfigPath, 'local', 'cardTypes');
      if (!existsSync(cardTypesDir)) {
        return { success: true, message: `No card types in the project` };
      }

      const cardTypeFiles = await readdir(cardTypesDir);
      const jsonFiles = cardTypeFiles.filter((f) => f.endsWith('.json'));

      console.log(`Found ${jsonFiles.length} local card type(s) to migrate`);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }

    return {
      success: true,
      message: 'Pre-migration checks completed successfully',
    };
  },

  /**
   * Create backup before migration using the standard helper.
   */
  async backup(context: MigrationContext): Promise<MigrationStepResult> {
    return createBackup(context);
  },

  /**
   * Perform the actual migration.
   * Updates all local cardType descriptions to include 'Migrated: ' prefix.
   */
  async migrate(context: MigrationContext): Promise<MigrationStepResult> {
    console.log(
      `Migrating cardType descriptions from version ${context.fromVersion} to ${context.toVersion}...`,
    );

    try {
      const cardTypesDir = join(context.cardsConfigPath, 'local', 'cardTypes');

      // Check if cardTypes directory exists
      if (!existsSync(cardTypesDir)) {
        console.log('No local cardTypes directory found - skipping migration');
        return {
          success: true,
          message: 'No local cardTypes to migrate',
        };
      }

      // Get all cardType JSON files
      const cardTypeFiles = await readdir(cardTypesDir);
      const jsonFiles = cardTypeFiles.filter((f) => f.endsWith('.json'));

      if (jsonFiles.length === 0) {
        console.log('No local cardTypes found to migrate');
        return {
          success: true,
          message: 'No local cardTypes to migrate',
        };
      }

      console.log(`Migrating ${jsonFiles.length} local cardType(s)...`);

      // Update each cardType's description
      for (const fileName of jsonFiles) {
        const filePath = join(cardTypesDir, fileName);
        const content = await readFile(filePath, 'utf8');
        const cardType = JSON.parse(content);

        if (!cardType.name) {
          console.warn(`Skipping ${fileName}: no name field`);
          continue;
        }

        const originalDescription = cardType.description || '';
        const newDescription = `Migrated: ${originalDescription}`;

        console.log(`  Updating cardType '${cardType.name}' description`);
        console.log(`    From: "${originalDescription}"`);
        console.log(`    To: "${newDescription}"`);

        // Update the description
        cardType.description = newDescription;

        // Write back to file
        await writeFile(filePath, JSON.stringify(cardType, null, 4), 'utf8');
      }

      return {
        success: true,
        message: `Successfully migrated ${jsonFiles.length} cardType(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  /**
   * Post-migration verification and cleanup.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async after(context: MigrationContext): Promise<MigrationStepResult> {
    return {
      success: true,
      message: 'Post-migration steps completed successfully',
    };
  },
};

export default migration;
