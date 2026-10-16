// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { runMigrationChain, SCHEMA_VERSION } from '@cyberismo/migrations';

import { ProjectPaths } from '../../infra/paths/project-paths.js';
import { readJsonFile } from '../../shared/utils/json.js';

/**
 * Migrate a project's schema to the tool's current version.
 *
 * Deliberately independent of Checkout and Workspace: migrate must
 * work on trees written by older schemas, which current project loading
 * may not accept. Reads schemaVersion via raw file I/O and delegates to
 * the in-process chain runner. Migrations modify the project in place;
 * version control is the safety net for recovering from a failure.
 *
 * @param projectRoot Absolute path to the project root
 * @returns Human-readable result message; throws on failure
 */
export async function migrateProject(projectRoot: string): Promise<string> {
  const paths = new ProjectPaths(projectRoot);
  const config = await readJsonFile(paths.configurationFile);
  const currentVersion: unknown = config?.schemaVersion;
  if (typeof currentVersion !== 'number') {
    throw new Error('Project has no schema version set');
  }

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Schema version mismatch: project is at schema version ${currentVersion}, this tool supports up to ${SCHEMA_VERSION}. Upgrade cyberismo.`,
    );
  }

  if (currentVersion === SCHEMA_VERSION) {
    return `Project is already at version ${currentVersion}. No migration needed.`;
  }

  await runMigrationChain(projectRoot, currentVersion);

  return `Successfully migrated from version ${currentVersion} to ${SCHEMA_VERSION}. Run 'cyberismo validate' to check the project.`;
}
