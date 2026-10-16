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
import { pathExists, resolveTilde } from '../../shared/utils/file-utils.js';
import { readJsonFileSync } from '../../shared/utils/json.js';

/**
 * Whether the folder at `path` is a project: it has `.cards` and `cardRoot`.
 */
export function isProjectFolder(path: string): boolean {
  return pathExists(join(path, '.cards')) && pathExists(join(path, 'cardRoot'));
}

/**
 * The project folders at `root`: `root` itself when it is a project, else its
 * subfolders that are, two levels deep at most. A project's own subfolders
 * are not searched.
 * @throws if `root` is not a folder.
 */
export async function projectFolders(root: string): Promise<string[]> {
  const rootPath = resolve(resolveTilde(root));
  if (isProjectFolder(rootPath)) {
    return [rootPath];
  }
  try {
    await readdir(rootPath);
  } catch {
    throw new Error(
      `Cannot scan for projects: '${rootPath}' does not exist or is not a directory`,
    );
  }

  const found: string[] = [];
  async function collect(path: string, depth: number) {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = join(path, entry.name);
      if (isProjectFolder(child)) {
        found.push(child);
      } else if (depth > 0) {
        await collect(child, depth - 1);
      }
    }
  }
  await collect(rootPath, 1);
  return found;
}

/**
 * The project folders at `root` with the prefix each one's configuration
 * names. A folder inside `root` whose configuration names no prefix or name
 * is skipped with a warning.
 * @throws if `root` is not a folder, or is a project without a valid
 *   configuration.
 */
export async function configuredFolders(
  root: string,
): Promise<{ path: string; prefix: string }[]> {
  const direct = isProjectFolder(resolve(resolveTilde(root)));
  const configured: { path: string; prefix: string }[] = [];
  for (const path of await projectFolders(root)) {
    try {
      configured.push({ path, prefix: prefixOf(path) });
    } catch (error) {
      if (direct) {
        throw error;
      }
      console.warn(
        `Skipping project directory '${path}': ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return configured;
}

// The prefix in the configuration of the project at `path`.
function prefixOf(path: string): string {
  const configPath = join(path, '.cards', 'local', 'cardsConfig.json');
  const config = readJsonFileSync(configPath) as {
    cardKeyPrefix?: string;
    name?: string;
  };
  if (!config?.cardKeyPrefix || !config?.name) {
    throw new Error(
      `Invalid project configuration at '${configPath}': missing cardKeyPrefix or name`,
    );
  }
  return config.cardKeyPrefix;
}
