#!/usr/bin/env node

import { join } from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';

/**
 * Generates version.json in tools/assets/src/schema/ based on the highest
 * migration version found in tools/migrations/src/
 */

// Script is in tools/migrations/scripts, navigate to src directory
const scriptDir = import.meta.dirname;
const migrationsRoot = join(scriptDir, '..');
const migrationsDir = join(migrationsRoot, 'src');
const assetsSchemaDir = join(migrationsRoot, '..', 'assets', 'src', 'schema');

/**
 * Fetches the highest migration version.
 */
async function latestMigrationVersion() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const versions = entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => parseInt(entry.name, 10));

  if (versions.length === 0) {
    throw new Error('No migration versions found');
  }

  return Math.max(...versions);
}

/**
 * Generates version.json based on existing migrations.
 */
async function generateVersionFile() {
  const latestVersion = await latestMigrationVersion();
  const versionContent = {
    schemaVersion: latestVersion,
  };

  const versionFilePath = join(assetsSchemaDir, 'version.json');
  await writeFile(
    versionFilePath,
    JSON.stringify(versionContent, null, 2) + '\n',
    'utf8',
  );

  console.log(`Set schemaVersion: ${latestVersion} in ${versionFilePath}`);
}

generateVersionFile().catch((error) => {
  console.error('Failed to generate version.json:', error);
  process.exit(1);
});
