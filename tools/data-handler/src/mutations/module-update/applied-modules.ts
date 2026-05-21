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

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import { pathExists } from '../../utils/file-utils.js';

export interface AppliedModule {
  prefix: string;
  installedVersion: string;
  appliedVersion: string;
}

function filePath(projectPath: string): string {
  return join(projectPath, '.cards', 'local', 'appliedModules.json');
}

/**
 * Read the applied-modules manifest for the given project.
 * Returns an empty array when the file does not exist or cannot be parsed.
 */
export async function readAppliedModules(
  projectPath: string,
): Promise<AppliedModule[]> {
  const path = filePath(projectPath);
  if (!pathExists(path)) return [];
  const content = await readFile(path, 'utf-8');
  try {
    const parsed = JSON.parse(content) as { modules?: AppliedModule[] };
    return Array.isArray(parsed.modules) ? parsed.modules : [];
  } catch {
    return [];
  }
}

/**
 * Atomically write the applied-modules manifest for the given project.
 * Writes to a temp file and renames into place.
 */
export async function writeAppliedModules(
  projectPath: string,
  modules: AppliedModule[],
): Promise<void> {
  const path = filePath(projectPath);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify({ modules }, null, 2) + '\n');
  await rename(tmp, path);
}

/**
 * Record that a module has been applied at the given version. Inserts a new
 * record or updates an existing one in place.
 */
export async function recordModuleApplied(
  projectPath: string,
  prefix: string,
  version: string,
): Promise<void> {
  const modules = await readAppliedModules(projectPath);
  const existing = modules.findIndex((m) => m.prefix === prefix);
  if (existing >= 0) {
    modules[existing] = {
      prefix,
      installedVersion: version,
      appliedVersion: version,
    };
  } else {
    modules.push({
      prefix,
      installedVersion: version,
      appliedVersion: version,
    });
  }
  await writeAppliedModules(projectPath, modules);
}
