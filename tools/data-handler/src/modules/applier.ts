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

import { randomBytes } from 'node:crypto';
import { mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';

import { ProjectPaths } from '../containers/project/project-paths.js';
import { deleteDir, pathExists } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';

import type { ResolvedModule } from './resolver.js';
import type { ModuleSetting } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';

const logger = getChildLogger({ module: 'applier' });

/**
 * Options consumed by {@link applyModules}.
 */
export interface ApplyOptions {
  /** Directory holding each entry's `stagedPath` tree. */
  tempDir: string;
}

interface StagedModule {
  name: string;
  /** Absolute path whose contents become the new `.cards/modules/<name>/`. */
  resourcesFolder: string;
  resolved: ResolvedModule;
}

/**
 * Copy each entry's staged tree into `.cards/modules/<name>/` and
 * persist top-level declarations.
 *
 * Every `stagedPath` is rooted in `options.tempDir` (the source layer
 * is responsible for staging there). The applier is therefore source-
 * agnostic: it owns the staging tree and may delete from it freely.
 */
export async function applyModules(
  project: Project,
  resolved: ResolvedModule[],
  options: ApplyOptions,
): Promise<void> {
  const selfPrefix = project.projectPrefix;

  // Skip transitive entries whose prefix matches the host project;
  // a top-level entry with the same collision is caught by
  // `validatePrefix` below.
  const targets: ResolvedModule[] = [];
  for (const entry of resolved) {
    if (
      entry.declaration.name === selfPrefix &&
      entry.declaration.parent !== undefined
    ) {
      logger.debug(
        { module: entry.declaration.name, selfPrefix },
        'skipping transitive installation whose prefix matches the host project',
      );
      continue;
    }
    targets.push(entry);
  }

  // Validate prefixes at plan level so all failures surface before any
  // filesystem mutation. Existing top-level modules skip the uniqueness
  // check (re-imports / updates).
  const existingDeclaredNames = new Set(
    project.configuration.modules.map((m) => m.name),
  );
  for (const entry of targets) {
    const name = entry.declaration.name;
    validatePrefix(
      project,
      name,
      /* skipIfExists */ existingDeclaredNames.has(name),
    );
  }

  const staged: StagedModule[] = targets.map(toStagedModule);

  // Apply each staged module. Partial-failure rollback is out of
  // scope: log and continue so later modules still get a chance.
  const applied: StagedModule[] = [];
  for (const stage of staged) {
    try {
      await applyOne(project, stage);
      applied.push(stage);
    } catch (error) {
      logger.error(
        {
          module: stage.name,
          err: error instanceof Error ? error.message : String(error),
        },
        'failed to apply staged module; project is temporarily inconsistent for this module',
      );
    }
  }

  // Persist top-level declarations for modules that actually landed on
  // disk. Only the declared range is stored; transitive declarations
  // are re-derived from each installation's own cardsConfig.json at
  // read time.
  for (const stage of applied) {
    const entry = stage.resolved;
    if (entry.declaration.parent !== undefined) {
      continue;
    }
    await project.configuration.upsertModule(toPersistedSetting(entry));
  }

  await Promise.all(
    applied.map((stage) => cleanupStage(stage, options.tempDir)),
  );

  await project.refreshAfterModuleChange();
}

function toStagedModule(entry: ResolvedModule): StagedModule {
  return {
    name: entry.declaration.name,
    resourcesFolder: new ProjectPaths(entry.stagedPath).resourcesFolder,
    resolved: entry,
  };
}

/**
 * Install a staged module at `.cards/modules/<name>/`, replacing any
 * existing installation via a move-aside + rename swap.
 *
 * Both `stage.resourcesFolder` (under the resolver's tempDir) and the
 * destination live on the project's filesystem, so `rename` is the
 * commit point. If anything goes wrong before the swap, the prior
 * installation is restored; the destination is never observed in a
 * half-built state.
 */
async function applyOne(project: Project, stage: StagedModule): Promise<void> {
  const destinationPath = join(project.paths.modulesFolder, stage.name);
  await mkdir(project.paths.modulesFolder, { recursive: true });

  const trashPath = `${destinationPath}.removing-${randomBytes(4).toString('hex')}`;
  const hadPrior = pathExists(destinationPath);
  if (hadPrior) {
    await rename(destinationPath, trashPath);
  }

  try {
    await rename(stage.resourcesFolder, destinationPath);
  } catch (error) {
    if (hadPrior) {
      try {
        await rename(trashPath, destinationPath);
      } catch (restoreError) {
        logger.error(
          {
            module: stage.name,
            path: trashPath,
            err:
              restoreError instanceof Error
                ? restoreError.message
                : String(restoreError),
          },
          'failed to restore prior installation after a failed rename swap; manual recovery may be required',
        );
      }
    }
    throw error;
  }

  if (hadPrior) {
    // Awaited so concurrent readers of `.cards/modules/` (orphan
    // sweeps, prefix caches) never observe the displaced directory.
    try {
      await deleteDir(trashPath);
    } catch (error) {
      logger.debug(
        {
          module: stage.name,
          path: trashPath,
          err: error instanceof Error ? error.message : String(error),
        },
        'failed to remove displaced previous installation; safe to delete manually',
      );
    }
  }

  logger.debug(
    {
      module: stage.name,
      from: stage.resourcesFolder,
      to: destinationPath,
    },
    'applied staged module',
  );
}

/**
 * Reshape a {@link ResolvedModule} into the `ModuleSetting` persisted
 * in `cardsConfig.json`. The stored `version` is the declared range,
 * never the resolved tag.
 */
function toPersistedSetting(entry: ResolvedModule): ModuleSetting {
  const setting: ModuleSetting = {
    name: entry.declaration.name,
    location: entry.declaration.source.location,
  };
  if (entry.declaration.source.private !== undefined) {
    setting.private = entry.declaration.source.private;
  }
  if (entry.declaration.versionRange !== undefined) {
    setting.version = entry.declaration.versionRange;
  }
  return setting;
}

/**
 * Rejects a new module whose prefix collides with a project-level
 * prefix already in use. Skipped for already-installed modules.
 */
function validatePrefix(
  project: Project,
  modulePrefix: string,
  skipIfExists: boolean,
): void {
  const currentlyUsedPrefixes = project.projectPrefixes();
  if (!currentlyUsedPrefixes.includes(modulePrefix)) {
    return;
  }
  if (skipIfExists) {
    return;
  }
  throw new Error(
    `Imported project has a prefix '${modulePrefix}' that is already used in the project. Cannot import from module.`,
  );
}

async function cleanupStage(
  stage: StagedModule,
  tempDir: string,
): Promise<void> {
  const stagedRoot = join(tempDir, stage.name);
  try {
    await deleteDir(stagedRoot);
  } catch (error) {
    // Staging cleanup is best-effort.
    logger.debug(
      {
        module: stage.name,
        path: stagedRoot,
        err: error instanceof Error ? error.message : String(error),
      },
      'failed to remove staging directory after successful apply',
    );
  }
}
