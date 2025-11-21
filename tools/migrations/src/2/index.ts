/**
 * Example migration from schema version 1 to version 2.
 *
 * This migration demonstrates:
 * - Fetching local cardTypes (not from modules)
 * - Updating resource properties using the .update() method
 * - Using the Migration interface with before(), backup(), migrate(), and after() functions
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

// Actual example migration implementation.
// Note that this is very verbose; actual migrations will ne a lot smaller.
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

    // Check that we can access the project
    try {
      // Extract project root from cardsConfigPath
      // cardsConfigPath format: /path/to/project/.cards
      const projectPath = join(context.cardsConfigPath, '..');
      const project = await getProject(projectPath);

      // Try to fetch cardTypes to ensure resources are accessible
      const { ResourcesFrom } = await import('@cyberismo/data-handler');
      const localCardTypes = project.resources.cardTypes(
        ResourcesFrom.localOnly,
      );

      console.log(
        `Found ${localCardTypes.length} local card type(s) to migrate`,
      );
    } catch (error) {
      return {
        success: false,
        message: `Failed to access project resources: ${error}`,
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
      // Extract project root from cardsConfigPath
      const projectPath = join(context.cardsConfigPath, '..');
      const project = await getProject(projectPath);

      // Import ResourcesFrom enum
      const { ResourcesFrom } = await import('@cyberismo/data-handler');

      // Fetch all local cardTypes (not from modules)
      const localCardTypes = project.resources.cardTypes(
        ResourcesFrom.localOnly,
      );

      if (localCardTypes.length === 0) {
        console.log('No local cardTypes found to migrate');
        return {
          success: true,
          message: 'No local cardTypes to migrate',
        };
      }

      console.log(`Migrating ${localCardTypes.length} local cardType(s)...`);

      // Update each cardType's description
      for (const cardType of localCardTypes) {
        const cardTypeData = cardType.data;

        if (!cardTypeData) {
          console.warn(`Skipping cardType with no data`);
          continue;
        }

        const originalDescription = cardTypeData.description || '';
        const newDescription = `Migrated: ${originalDescription}`;

        console.log(`  Updating cardType '${cardTypeData.name}' description`);
        console.log(`    From: "${originalDescription}"`);
        console.log(`    To: "${newDescription}"`);

        // Update the description using the update() method
        await cardType.update(
          { key: 'description' },
          {
            name: 'change',
            target: originalDescription,
            to: newDescription,
          },
        );
      }

      return {
        success: true,
        message: `Successfully migrated ${localCardTypes.length} cardType(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Migration failed: ${error}`,
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
