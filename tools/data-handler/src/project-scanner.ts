/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join, resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { pathExists, resolveTilde } from './utils/file-utils.js';
import { readJsonFileSync } from './utils/json.js';

export interface ProjectEntry {
  path: string;
  prefix: string;
  name: string;
}

/**
 * Check whether a directory is a Cyberismo project (has `.cards/` and `cardRoot/`).
 */
function isProjectDirectory(dirPath: string): boolean {
  return (
    pathExists(join(dirPath, '.cards')) && pathExists(join(dirPath, 'cardRoot'))
  );
}

/**
 * Read project prefix and name from a project directory's cardsConfig.json.
 */
function readProjectMeta(projectPath: string): {
  prefix: string;
  name: string;
} {
  const configPath = join(projectPath, '.cards', 'local', 'cardsConfig.json');
  const config = readJsonFileSync(configPath) as {
    cardKeyPrefix?: string;
    name?: string;
  };
  if (!config?.cardKeyPrefix || !config?.name) {
    throw new Error(
      `Invalid project configuration at '${configPath}': missing cardKeyPrefix or name`,
    );
  }
  return { prefix: config.cardKeyPrefix, name: config.name };
}

/**
 * Scan for Cyberismo projects starting from `basePath`.
 *
 * Detection is strictly binary:
 * - If `basePath` itself is a project (has `.cards/` + `cardRoot/`), returns a single-entry list.
 * - Otherwise, treats `basePath` as a collection directory and scans its
 *   first-level subdirectories for projects. Non-project directories are
 *   scanned one level deeper. Returns the list of found projects
 *   (may be empty — an empty collection is valid).
 */
export async function scanForProjects(
  basePath: string,
): Promise<ProjectEntry[]> {
  const rootPath = resolve(resolveTilde(basePath));

  // Direct project
  if (isProjectDirectory(rootPath)) {
    const meta = readProjectMeta(rootPath);
    return [{ path: rootPath, ...meta }];
  }

  // Collection directory — scan subdirectories up to 2 levels deep
  const projects: ProjectEntry[] = [];
  const seenPrefixes = new Map<string, string>();

  async function collectProjects(dirPath: string, depth: number) {
    let entries;
    try {
      entries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childPath = join(dirPath, entry.name);
      if (isProjectDirectory(childPath)) {
        try {
          const meta = readProjectMeta(childPath);
          const existing = seenPrefixes.get(meta.prefix);
          if (existing) {
            console.warn(
              `Skipping project '${childPath}': duplicate prefix '${meta.prefix}' (already registered from '${existing}')`,
            );
            continue;
          }
          seenPrefixes.set(meta.prefix, childPath);
          projects.push({ path: childPath, ...meta });
        } catch (error) {
          console.warn(
            `Skipping project directory '${childPath}': ${error instanceof Error ? error.message : error}`,
          );
        }
      } else if (depth > 0) {
        await collectProjects(childPath, depth - 1);
      }
    }
  }

  try {
    await readdir(rootPath);
  } catch {
    throw new Error(
      `Cannot scan for projects: '${rootPath}' does not exist or is not a directory`,
    );
  }

  await collectProjects(rootPath, 1);

  return projects;
}
