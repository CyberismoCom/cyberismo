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

import { join, resolve as pathResolve } from 'node:path';

import { ProjectPaths } from '../containers/project/project-paths.js';
import { Validate } from '../commands/validate.js';
import { copyDir, deleteDir, pathExists } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';

import { FILE_PROTOCOL } from './location.js';

import type { ResolvedModule } from './resolver.js';
import type { ModuleSetting } from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';

const logger = getChildLogger({ module: 'installer' });

/**
 * Options consumed by {@link installModules}.
 */
export interface InstallOptions {
  /** Directory holding each entry's `stagedPath` tree. */
  tempDir: string;
  /** When true, validate each `file:` source before applying. */
  validate?: boolean;
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
 */
export async function installModules(
  project: Project,
  resolved: ResolvedModule[],
  options: InstallOptions,
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

  if (options.validate) {
    validateFileSources(targets);
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

  // Clean up staging for cleanly-applied modules. Failed stages are
  // intentionally left on disk so the offending tree can be inspected
  // after the run — see module-system.allium's "Should temp staging
  // directory be cleaned up on failure" open question. Callers that
  // do not want the leftovers should pass a short-lived tempDir.
  await Promise.all(
    applied
      .filter((stage) => isGitStage(stage, options.tempDir))
      .map((stage) => cleanupStage(stage, options.tempDir)),
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
 * Copy a staged module into `.cards/modules/<name>/`, replacing any
 * existing installation.
 */
async function applyOne(project: Project, stage: StagedModule): Promise<void> {
  const destinationPath = join(project.paths.modulesFolder, stage.name);
  await deleteDir(destinationPath);
  await copyDir(stage.resourcesFolder, destinationPath);
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

/**
 * For each `file:` source, ensure the referenced folder name is a
 * legal OS path and actually exists.
 */
function validateFileSources(targets: ResolvedModule[]): void {
  for (const entry of targets) {
    const location = entry.declaration.source.location;
    if (!location.startsWith(FILE_PROTOCOL)) {
      continue;
    }
    const folder = location.substring(FILE_PROTOCOL.length);
    if (!Validate.validateFolder(folder)) {
      throw new Error(
        `Input validation error: folder name is invalid '${folder}'`,
      );
    }
    if (!pathExists(folder)) {
      throw new Error(
        `Input validation error: cannot find project '${folder}'`,
      );
    }
  }
}

/**
 * True when `stage` was produced by a git fetch into `tempDir` and
 * therefore owns the staging directory. File sources point at the
 * caller's own checkout and must not be deleted.
 */
function isGitStage(stage: StagedModule, tempDir: string): boolean {
  const location = stage.resolved.declaration.source.location;
  if (location.startsWith(FILE_PROTOCOL)) {
    return false;
  }
  const stagedRoot = pathResolve(join(tempDir, stage.name));
  return stage.resourcesFolder.startsWith(stagedRoot);
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
