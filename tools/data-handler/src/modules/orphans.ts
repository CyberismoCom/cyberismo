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

import { deleteDir } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { readJsonFile } from '../utils/json.js';
import { createInventory } from './inventory.js';

import type { Project } from '../containers/project.js';
import type { ModuleInstallation } from './types.js';

/**
 * Options for {@link cleanOrphans}.
 */
export interface CleanOrphansOptions {
  /**
   * Maximum iterations; throws if exceeded. Defaults to the initial
   * installation count + 2 (a finite graph can require at most O(depth)
   * passes; the cap exists purely to prevent pathological loops on
   * malformed inputs).
   */
  maxIterations?: number;
  /**
   * Hook invoked before an orphaned installation's folder is deleted.
   * Intended for logging / telemetry from callers that want to surface
   * what was removed. Exceptions thrown by the hook propagate.
   */
  onRemove?: (installation: ModuleInstallation) => void;
}

/**
 * Minimal shape of an installation's own `cardsConfig.json` — only the
 * fields this module reads. Other fields are allowed and ignored.
 */
interface InstallationConfig {
  modules?: Array<{ name?: string }>;
}

/**
 * Fixed-point orphan cleanup. Deletes installations under
 * `.cards/modules/<name>/` for modules that nothing references.
 *
 * An installation is "orphaned" when:
 *   - no top-level declaration in the project names it, AND
 *   - no other installation's own `cardsConfig.json` declares it as a
 *     dependency.
 *
 * Cascades: removing an installation may orphan its former dependencies,
 * which are removed on the next pass. Iterates until stable.
 *
 * Implements the spec's `CleanOrphans` rule (see `module-system.allium`).
 * Does NOT modify `project.configuration.modules`; top-level declarations
 * are the caller's responsibility (e.g. `RemoveModule`). Transitive
 * declarations are virtual — derived from each installation's own config
 * — so they "disappear" automatically when the installation folder goes.
 *
 * @param project Project whose `.cards/modules/` is being reconciled.
 * @param options Optional hooks and iteration cap.
 * @returns Number of installation folders removed across all iterations.
 */
export async function cleanOrphans(
  project: Project,
  options: CleanOrphansOptions = {},
): Promise<number> {
  const logger = getChildLogger({ module: 'orphans' });
  const inventory = createInventory();

  // Pre-compute the safety cap from the initial installed count. A finite
  // dependency graph can cascade at most O(depth) times; this + 2 is a
  // generous upper bound that still catches runaway loops on malformed
  // inputs (e.g. hand-edited `cardsConfig.json`).
  const initialInstalled = await inventory.installed(project);
  const maxIterations = options.maxIterations ?? initialInstalled.length + 2;

  let removed = 0;
  let currentInstalled = initialInstalled;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const declared = inventory.declared(project);
    // Reuse the already-fetched `initialInstalled` on the first pass to
    // avoid a redundant disk walk; subsequent passes re-read.
    const installed =
      iteration === 1 ? currentInstalled : await inventory.installed(project);
    currentInstalled = installed;

    const referenced = new Set<string>();
    for (const decl of declared) {
      referenced.add(decl.name);
    }

    for (const installation of installed) {
      const config = await readInstallationConfig(installation, logger);
      if (!config) {
        continue;
      }
      for (const dep of config.modules ?? []) {
        if (typeof dep.name === 'string' && dep.name.length > 0) {
          referenced.add(dep.name);
        }
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
    // Invalidate the module cache exactly once, after all deletions, so
    // downstream resource lookups don't return stale prefixes. Also
    // refresh the in-memory project caches (all-module-prefix list and
    // loaded template cards) to keep them in sync with the filesystem.
    project.resources.changedModules();
    project.refreshAllModulePrefixes();
    await project.populateTemplateCards();
  }

  return removed;
}

/**
 * Reads an installation's own `cardsConfig.json`. Returns `undefined`
 * when the file is missing or unreadable — the caller treats that as
 * "no declared deps" rather than failing the whole cleanup.
 */
async function readInstallationConfig(
  installation: ModuleInstallation,
  logger: ReturnType<typeof getChildLogger>,
): Promise<InstallationConfig | undefined> {
  const configPath = joinConfigPath(installation.path);
  try {
    const config = (await readJsonFile(configPath)) as
      | InstallationConfig
      | undefined;
    return config;
  } catch (error) {
    logger.debug(
      {
        module: installation.name,
        path: configPath,
        err: error instanceof Error ? error.message : String(error),
      },
      'installation has no readable cardsConfig.json; treating as having no declared deps',
    );
    return undefined;
  }
}

function joinConfigPath(installationPath: string): string {
  // `installation.path` points at `.cards/modules/<name>/`; the config
  // file sits directly inside it. Built from the installation path
  // directly to avoid reaching back into `Project.paths`.
  return join(installationPath, 'cardsConfig.json');
}
