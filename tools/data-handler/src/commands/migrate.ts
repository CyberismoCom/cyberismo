/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { SCHEMA_VERSION } from '@cyberismo/assets';

import { ProjectPaths } from '../containers/project/project-paths.js';
import { readJsonFile } from '../utils/json.js';
import { runMigrationChain } from '../migrations/run-chain.js';

/**
 * Migrate a project's schema to the tool's current version.
 *
 * Deliberately independent of Project and CommandManager: migrate must
 * work on trees written by older schemas, which current project loading
 * may not accept. Reads schemaVersion via raw file I/O and delegates to
 * the in-process chain runner. Migrations modify the project in place;
 * version control is the safety net for recovering from a failure.
 *
 * @param projectRoot Absolute path to the project root
 * @returns Human-readable result message; throws on failure
 */
export async function migrate(projectRoot: string): Promise<string> {
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
