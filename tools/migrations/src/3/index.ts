/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';
import { access, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

import type {
  Migration,
  MigrationContext,
  MigrationStepResult,
} from '../migration-interfaces.js';

const RESOURCE_FOLDERS = [
  'calculations',
  'cardTypes',
  'fieldTypes',
  'graphModels',
  'graphViews',
  'linkTypes',
  'reports',
  'templates',
  'workflows',
];

/**
 * Migration from schema version 2 to 3
 *
 * Changes:
 * - Moves resources from flat .cards/local/ into versioned .cards/local/1/ structure
 * - Creates empty migrationLog-1.jsonl in .cards/local/migrations/
 * - Sets version: 0 in cardsConfig.json (folder 1/ is the draft ahead of published version 0)
 *
 * Idempotent: if .cards/local/1/ already exists, the migration is skipped.
 */
const migration: Migration = {
  async migrate(context: MigrationContext): Promise<MigrationStepResult> {
    console.log(
      `Migrating from schema version ${context.fromVersion} to ${context.toVersion}`,
    );

    const localFolder = join(context.cardsConfigPath, 'local');
    const version1Folder = join(localFolder, '1');

    // Idempotent: skip if version folder already exists
    try {
      await access(version1Folder);
      console.log('Version folder 1/ already exists, skipping resource move');
      return {
        success: true,
        message:
          'Schema updated to version 3: versioned directory structure (already migrated)',
      };
    } catch {
      // Folder doesn't exist yet — proceed with migration
    }

    // Create version 1 folder
    await mkdir(version1Folder, { recursive: true });

    // Move each resource folder into version 1
    for (const folder of RESOURCE_FOLDERS) {
      const sourcePath = join(localFolder, folder);
      const destPath = join(version1Folder, folder);
      try {
        await cp(sourcePath, destPath, { recursive: true });
        await rm(sourcePath, { recursive: true, force: true });
        console.log(`  - Moved ${folder}`);
      } catch {
        // Source folder doesn't exist, skip
      }
    }

    // Copy existing migration log or create empty one in .cards/local/migrations/
    const migrationsFolder = join(localFolder, 'migrations');
    const oldCurrentLog = join(
      migrationsFolder,
      'current',
      'migrationLog.jsonl',
    );
    const newMigrationLog = join(migrationsFolder, 'migrationLog-1.jsonl');

    await mkdir(migrationsFolder, { recursive: true });

    try {
      await cp(oldCurrentLog, newMigrationLog);
      console.log('  - Copied existing migration log');
    } catch {
      await writeFile(newMigrationLog, '', 'utf-8');
    }

    // Clean up old current/ subfolder if it existed
    await rm(join(migrationsFolder, 'current'), {
      recursive: true,
      force: true,
    });

    // Update cardsConfig.json
    const configPath = join(localFolder, 'cardsConfig.json');
    const raw = await readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    config.version = 0;
    await writeFile(
      configPath,
      JSON.stringify(config, null, 4) + '\n',
      'utf-8',
    );

    console.log('Migration to versioned structure complete.');

    return {
      success: true,
      message:
        'Schema updated to version 3: resources moved to versioned directory structure',
    };
  },
};

export default migration;
