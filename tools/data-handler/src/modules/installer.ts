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

import { existsSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';

import { ProjectPaths } from '../containers/project/project-paths.js';
import { Validate } from '../commands/validate.js';
import { copyDir, deleteDir, pathExists } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';

import type { ResolvedModule } from './resolver.js';
import type { SourceLayer } from './source.js';
import type {
  Credentials,
  ModuleSetting,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';

/**
 * Options consumed by {@link Installer.install}.
 */
export interface InstallOptions {
  /** Credentials for private HTTPS remotes. */
  credentials?: Credentials;
  /** Temporary directory used for staging clones. */
  tempDir: string;
  /** When true, validate each `file:` source before fetching. */
  validate?: boolean;
}

const FILE_PROTOCOL = 'file:';

/**
 * A module that has been fetched into `tempDir` and is ready to be
 * copied into place. `resourcesFolder` is the absolute path whose
 * contents become the new `.cards/modules/<name>/`.
 */
interface StagedModule {
  name: string;
  resourcesFolder: string;
  resolved: ResolvedModule;
}

/**
 * Applies a resolved module plan to a project's `.cards/modules/`.
 * Fetches every target into staging first, then replaces installation
 * files so a fetch failure cannot leave the project half-updated.
 */
export class Installer {
  private readonly logger = getChildLogger({ module: 'installer' });

  constructor(private readonly source: SourceLayer) {}

  /**
   * Two-phase install: fetch all targets into `tempDir`, then replace
   * each `.cards/modules/<name>/` from its staged copy and persist the
   * top-level declarations. The caller owns the resolved plan.
   */
  async install(
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
        this.logger.debug(
          { module: entry.declaration.name, selfPrefix },
          'skipping transitive installation whose prefix matches the host project',
        );
        continue;
      }
      targets.push(entry);
    }

    if (options.validate) {
      this.validateFileSources(targets);
    }

    // Validate prefixes at plan level so all failures surface before any
    // network I/O. Existing top-level modules skip the uniqueness check
    // (re-imports / updates).
    const existingDeclaredNames = new Set(
      project.configuration.modules.map((m) => m.name),
    );
    for (const entry of targets) {
      const name = entry.declaration.name;
      this.validatePrefix(
        project,
        name,
        /* skipIfExists */ existingDeclaredNames.has(name),
      );
    }

    // Fetch every target into tempDir staging in parallel. On failure,
    // abort before touching `.cards/modules/`.
    let staged: StagedModule[];
    try {
      staged = await Promise.all(
        targets.map((entry) => this.fetchOne(entry, options.tempDir)),
      );
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Module install failed during network phase: ${error}`, {
        cause: error,
      });
    }

    // Apply each staged module. Partial-failure rollback is out of
    // scope: log and continue so later modules still get a chance.
    const applied: StagedModule[] = [];
    for (const stage of staged) {
      try {
        await this.applyOne(project, stage);
        applied.push(stage);
      } catch (error) {
        this.logger.error(
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
      await project.configuration.upsertModule(this.toPersistedSetting(entry));
    }

    // Clean up staging for cleanly-applied modules. Failed stages are
    // intentionally left on disk so the offending tree can be inspected
    // after the run — see module-system.allium's "Should temp staging
    // directory be cleaned up on failure" open question. Callers that
    // do not want the leftovers should pass a short-lived tempDir.
    await Promise.all(
      applied
        .filter((stage) => this.isGitStage(stage, options.tempDir))
        .map((stage) => this.cleanupStage(stage, options.tempDir)),
    );

    await project.refreshAfterModuleChange();
  }

  /**
   * Fetch a single module's source into tempDir (or resolve its local
   * path for `file:` sources). Reuses the resolver's staged clone when
   * available to avoid re-cloning, falling back to a fresh fetch only
   * when the staged path has disappeared.
   */
  private async fetchOne(
    entry: ResolvedModule,
    tempDir: string,
  ): Promise<StagedModule> {
    const { declaration, remoteUrl, ref } = entry;

    let stagingRoot: string;
    if (entry.stagedPath && existsSync(entry.stagedPath)) {
      stagingRoot = entry.stagedPath;
    } else {
      stagingRoot = await this.source.fetch(
        { location: declaration.source.location, remoteUrl, ref },
        tempDir,
        declaration.name,
      );
    }

    // The resources to copy live under the staging root's `.cards/<prefix>/`
    // tree for both git and file sources.
    const resourcesFolder = new ProjectPaths(stagingRoot).resourcesFolder;

    return {
      name: declaration.name,
      resourcesFolder,
      resolved: entry,
    };
  }

  /**
   * Copy a staged module into `.cards/modules/<name>/`, replacing any
   * existing installation.
   */
  private async applyOne(project: Project, stage: StagedModule): Promise<void> {
    const destinationPath = join(project.paths.modulesFolder, stage.name);
    await deleteDir(destinationPath);
    await copyDir(stage.resourcesFolder, destinationPath);
    this.logger.debug(
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
  private toPersistedSetting(entry: ResolvedModule): ModuleSetting {
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
  private validatePrefix(
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
  private validateFileSources(targets: ResolvedModule[]): void {
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
  private isGitStage(stage: StagedModule, tempDir: string): boolean {
    const location = stage.resolved.declaration.source.location;
    if (location.startsWith(FILE_PROTOCOL)) {
      return false;
    }
    const stagedRoot = pathResolve(join(tempDir, stage.name));
    return stage.resourcesFolder.startsWith(stagedRoot);
  }

  private async cleanupStage(
    stage: StagedModule,
    tempDir: string,
  ): Promise<void> {
    const stagedRoot = join(tempDir, stage.name);
    try {
      await deleteDir(stagedRoot);
    } catch (error) {
      // Staging cleanup is best-effort.
      this.logger.debug(
        {
          module: stage.name,
          path: stagedRoot,
          err: error instanceof Error ? error.message : String(error),
        },
        'failed to remove staging directory after successful apply',
      );
    }
  }
}

/**
 * Construct the default {@link Installer} backed by a {@link SourceLayer}.
 */
export function createInstaller(source: SourceLayer): Installer {
  return new Installer(source);
}
