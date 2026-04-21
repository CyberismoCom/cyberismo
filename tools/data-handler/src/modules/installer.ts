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
  /**
   * Credentials used for private HTTPS remotes. Forwarded verbatim to
   * the source layer through each resolved module's pre-built
   * `remoteUrl`; the installer itself does not inject credentials.
   */
  credentials?: Credentials;
  /**
   * Temporary directory used for intermediate clones in the network
   * phase. Shared with the resolver when possible so that staged copies
   * can be reused.
   */
  tempDir: string;
  /**
   * When true, validate each `file:` source's folder shape before the
   * network phase. Mirrors the `importFileModule` preconditions from
   * the legacy `ModuleManager`. Defaults to false — consistent with
   * update flows where the caller already trusts the sources.
   */
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
 * Implements the spec's `ReplaceInstallation` rule with the two-phase
 * `@guidance` applied: fetch every target first (network phase), then
 * replace the installation files (apply phase).
 */
export class Installer {
  private readonly logger = getChildLogger({ module: 'installer' });

  constructor(private readonly source: SourceLayer) {}

  /**
   * Two-phase atomic installation:
   *   1. **Network phase**: fetch every target's resources into
   *      `options.tempDir` staging. If any fetch fails, abort before
   *      touching `.cards/modules/`.
   *   2. **Apply phase**: replace each `.cards/modules/<name>/` from its
   *      staged copy. Upsert the project-level declarations (persisted
   *      range only — never the resolved tag).
   *
   * The installer does not re-resolve. The caller owns the plan.
   */
  async install(
    project: Project,
    resolved: ResolvedModule[],
    options: InstallOptions,
  ): Promise<void> {
    const selfPrefix = project.projectPrefix;

    // Split the plan:
    //  - `targets`     : entries we will install.
    //  - `skippedSelf` : transitive entries whose name happens to match the
    //                    project's own `cardKeyPrefix`. We silently skip
    //                    these because the project already provides that
    //                    prefix (e.g. when A and B cross-import each other,
    //                    B's cardsConfig lists A as a transitive). A
    //                    top-level entry (parent == undefined) with this
    //                    same collision is a real user error — the caller
    //                    is trying to import a module whose prefix matches
    //                    the host project — and we let `validatePrefix`
    //                    surface that below.
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

    // ------------------------------------------------------------------
    // Prefix validation (pre-network). The legacy ModuleManager ran this
    // against each newly-installed module; we do the same here, but at
    // the plan level so all failures surface before any network I/O.
    // Modules already present in the project's persisted declarations
    // skip the uniqueness check (re-imports / updates).
    // ------------------------------------------------------------------
    const existingDeclaredNames = new Set(
      project.configuration.modules.map((m) => m.name),
    );
    for (const entry of targets) {
      const name = entry.declaration.name;
      // Transitive declarations are not exposed to `projectPrefixes()`
      // either (that only considers top-level declarations), so they are
      // naturally covered by the same check: either the prefix collides
      // with a different existing top-level module (error) or it matches
      // an existing one (skip).
      this.validatePrefix(
        project,
        name,
        /* skipIfExists */ existingDeclaredNames.has(name),
      );
    }

    // ------------------------------------------------------------------
    // Network phase. Fetch every target into tempDir staging. We keep
    // these running in parallel — the source layer already serialises
    // filesystem writes per clone target via its destinationPath.
    // ------------------------------------------------------------------
    let staged: StagedModule[];
    try {
      staged = await Promise.all(
        targets.map((entry) => this.fetchOne(entry, options.tempDir)),
      );
    } catch (error) {
      // Per spec open question #4: leave tempDir contents intact on
      // failure for debugging. Re-throw so the caller sees the fault.
      throw error instanceof Error
        ? error
        : new Error(`Module install failed during network phase: ${error}`);
    }

    // ------------------------------------------------------------------
    // Apply phase. Replace each .cards/modules/<name>/ from its staged
    // copy. Per spec open questions #3/#4, partial-failure rollback is
    // out of scope: we log and continue so that later modules still get
    // a chance to land.
    // ------------------------------------------------------------------
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

    // Refresh module resource cache after all filesystem replacements.
    project.resources.changedModules();

    // ------------------------------------------------------------------
    // Persist top-level declarations. Only the declared range is stored;
    // the resolved tag is never written back per spec.
    // ------------------------------------------------------------------
    for (const entry of targets) {
      if (entry.declaration.parent !== undefined) {
        // Transitive declarations are virtual — they are re-derived from
        // each installation's own cardsConfig.json at read time.
        continue;
      }
      await project.configuration.upsertModule(this.toPersistedSetting(entry));
    }

    // ------------------------------------------------------------------
    // Cleanup staging for modules that were applied cleanly. Anything we
    // failed to apply is left behind for debugging.
    // ------------------------------------------------------------------
    await Promise.all(
      applied
        .filter((stage) => this.isGitStage(stage, options.tempDir))
        .map((stage) => this.cleanupStage(stage, options.tempDir)),
    );

    // Refresh the in-memory project caches so newly-installed modules
    // (including transitives) are immediately visible through the
    // Project API. The installer always mutates resources, so this runs
    // unconditionally.
    project.refreshAllModulePrefixes();
    await project.populateTemplateCards();
  }

  /**
   * Fetch a single module's source into tempDir (or resolve its local
   * path for `file:` sources). Returns the staging metadata consumed by
   * the apply phase.
   */
  private async fetchOne(
    entry: ResolvedModule,
    tempDir: string,
  ): Promise<StagedModule> {
    const { declaration, remoteUrl, ref } = entry;

    const stagingRoot = await this.source.fetch(
      { location: declaration.source.location, remoteUrl, ref },
      tempDir,
      declaration.name,
    );

    // `SourceLayer.fetch` returns the path that already contains the
    // module's checkout (git) or the local file-source root. In both
    // cases the resources to copy live under the project's `.cards/<prefix>/`
    // tree. `ProjectPaths.resourcesFolder` computes that path for us.
    const resourcesFolder = new ProjectPaths(stagingRoot).resourcesFolder;

    return {
      name: declaration.name,
      resourcesFolder,
      resolved: entry,
    };
  }

  /**
   * Copy a staged module into `.cards/modules/<name>/`. The replacement
   * is "rm then copy" — the legacy `ModuleManager.handleGitModule` did
   * the same. `copyDir` creates the destination folder if missing.
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
   * Reshape a {@link ResolvedModule} into the legacy `ModuleSetting`
   * that is persisted in `cardsConfig.json`. Crucially, the persisted
   * `version` is the declared range — not the resolved tag — per spec.
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
   * Port of the legacy `ModuleManager.validatePrefix`. Rejects a new
   * module whose prefix collides with a project-level prefix already in
   * use. Skipped for modules the caller has marked as already installed
   * (re-imports / updates).
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
   * Optional pre-check: for each `file:` source, ensure the referenced
   * folder name is a legal OS path and actually exists. Matches the
   * historical `ModuleManager.importFileModule` preconditions.
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
   * True when `stage` was produced by a git fetch into `tempDir` (and
   * therefore owns the staging directory — safe to remove on success).
   * File sources have their staging root pointing at the caller's own
   * local checkout; we never delete those.
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
      // Staging cleanup is best-effort — a failure here does not affect
      // the installation outcome. Log and move on.
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
 * Construct the default {@link Installer} — a two-phase apply backed by
 * a {@link SourceLayer} for fetches.
 */
export function createInstaller(source: SourceLayer): Installer {
  return new Installer(source);
}
