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
import { createInventory } from './inventory.js';

import type { Project } from '../containers/project.js';
import type { ModuleInstallation } from './types.js';

/**
 * Options for {@link cleanOrphans}.
 */
export interface CleanOrphansOptions {
  /** Safety cap on fixed-point iterations. */
  maxIterations?: number;
  /** Hook invoked before each orphan is deleted. Exceptions propagate. */
  onRemove?: (installation: ModuleInstallation) => void;
}

/**
 * Fixed-point orphan cleanup. Deletes installations under
 * `.cards/modules/<name>/` that no top-level declaration and no other
 * installation's `cardsConfig.json` references, iterating until stable
 * so cascaded orphans are caught.
 *
 * Does not touch `project.configuration.modules` — top-level declarations
 * are the caller's responsibility.
 *
 * @returns Number of installation folders removed across all iterations.
 */
export async function cleanOrphans(
  project: Project,
  options: CleanOrphansOptions = {},
): Promise<number> {
  const logger = getChildLogger({ module: 'orphans' });
  const inventory = createInventory();

  // Default cap: initial count + 2 is enough for any finite graph.
  const initialInstalled = await inventory.installed(project);
  const maxIterations = options.maxIterations ?? initialInstalled.length + 2;

  let removed = 0;
  let currentInstalled = initialInstalled;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const declared = inventory.declared(project);
    // Reuse `initialInstalled` on the first pass to skip a disk walk.
    const installed =
      iteration === 1 ? currentInstalled : await inventory.installed(project);
    currentInstalled = installed;

    const referenced = new Set<string>();
    for (const decl of declared) {
      referenced.add(decl.name);
    }

    for (const installation of installed) {
      for (const dep of installation.declaredDependencies) {
        referenced.add(dep);
      }
    }

    const toRemove = installed.filter((i) => !referenced.has(i.name));
    if (toRemove.length === 0) {
      break;
    }

    for (const installation of toRemove) {
      logger.debug(
        { module: installation.name, path: installation.path, iteration },
        'removing orphaned module installation',
      );
      options.onRemove?.(installation);
      await deleteDir(installation.path);
      removed++;
    }

    if (iteration === maxIterations) {
      const graphDump = installed.map((i) => i.name).join(', ');
      throw new Error(
        `cleanOrphans exceeded maxIterations (${maxIterations}); ` +
          `graph dump: [${graphDump}]`,
      );
    }
  }

  if (removed > 0) {
    await project.refreshAfterModuleChange();
  }

  return removed;
}
