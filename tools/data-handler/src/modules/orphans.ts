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

import { deleteDir } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { declaredModules, installedModules } from './inventory.js';

import type { Project } from '../containers/project.js';
import type { ModuleInstallation } from './types.js';

/**
 * Options for {@link cleanOrphans}.
 */
export interface CleanOrphansOptions {
  /** Hook invoked before each orphan is deleted. Exceptions propagate. */
  onRemove?: (installation: ModuleInstallation) => void;
}

/**
 * Installations that no declaration reaches, directly or through the
 * remaining installations' dependencies, iterated to a fixed point. An
 * unreferenced cycle is kept.
 */
export function findOrphans<
  T extends { name: string; declaredDependencies: string[] },
>(declared: string[], installed: T[]): T[] {
  const orphans: T[] = [];
  let remaining = installed;
  for (;;) {
    const referenced = new Set(declared);
    for (const installation of remaining) {
      for (const dep of installation.declaredDependencies) {
        referenced.add(dep);
      }
    }
    const toRemove = remaining.filter((i) => !referenced.has(i.name));
    if (toRemove.length === 0) break;
    orphans.push(...toRemove);
    remaining = remaining.filter((i) => referenced.has(i.name));
  }
  return orphans;
}

/**
 * Fixed-point orphan cleanup. Deletes the installations under
 * `.cards/modules/<name>/` that {@link findOrphans} reports.
 *
 * Does not touch `project.configuration.modules` — top-level declarations
 * are the caller's responsibility.
 *
 * @returns Number of installation folders removed.
 */
export async function cleanOrphans(
  project: Project,
  options: CleanOrphansOptions = {},
): Promise<number> {
  const logger = getChildLogger({ module: 'orphans' });
  const orphans = findOrphans(
    declaredModules(project).map((d) => d.name),
    await installedModules(project),
  );
  for (const installation of orphans) {
    logger.debug(
      { module: installation.name, path: installation.path },
      'removing orphaned module installation',
    );
    options.onRemove?.(installation);
    await deleteDir(installation.path);
  }
  if (orphans.length > 0) {
    await project.refreshAfterModuleChange();
  }
  return orphans.length;
}
