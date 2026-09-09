/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join, resolve as pathResolve } from 'node:path';

import { pathExists } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { read, write } from '../utils/rw-lock.js';
import { Validate } from './validate.js';

import {
  applyModules,
  buildRemoteUrl,
  conflictReason,
  declaredModules,
  ensureStagedSchemas,
  installedModules,
  installedModulesWithSources,
  moduleInfos,
  resolveForApply,
  createSourceLayer,
  FILE_PROTOCOL,
  isFileLocation,
  isGitLocation,
  stripFileProtocol,
  pickVersion,
  toVersion,
  toVersionRange,
  validateVersionAgainstConstraints,
} from '../modules/index.js';
import { readModuleConfig } from '../containers/project/cards-config.js';
import { cleanOrphans } from '../modules/orphans.js';
import {
  executeModuleReplays,
  filterStepsToApplied,
  ModuleValidationFailedError,
  planModuleReplays,
} from '../mutations/replay/replay.js';

import type {
  Credentials,
  ModuleContent,
  ModuleInfo,
  ModuleSetting,
  ModuleSettingOptions,
} from '../interfaces/project-interfaces.js';
import type { Fetch } from './fetch.js';
import type { Project } from '../containers/project.js';
import type {
  ResolveConflict,
  ResolvedModule,
} from '../modules/resolve/types.js';

/**
 * Coerce a caller-supplied source into the canonical form used by the
 * module layers:
 *
 * - Git URLs (`https://…`, `git@…`) pass through unchanged.
 * - `file:<path>` URLs pass through unchanged.
 * - Any other value is treated as a bare filesystem path and rewritten to
 *   `file:<absolute path>` so the source layer can dispatch on the protocol.
 */
function normaliseLocation(source: string): string {
  if (isGitLocation(source) || isFileLocation(source)) {
    return source;
  }
  return `${FILE_PROTOCOL}${pathResolve(source)}`;
}

/**
 * Produce a deterministic staging subdirectory name for a fresh-root
 * import, keyed off the location's tail.
 */
function freshRootStagingName(location: string): string {
  const last = location.lastIndexOf('/');
  const tail =
    last >= 0 ? location.slice(last + 1).replace(/\.git$/i, '') : location;
  const safe = tail.replace(/[^A-Za-z0-9._-]/g, '_') || 'module';
  return `${safe}.__fresh__`;
}

/**
 * Build a human-readable error from the engine's resolution conflicts so a
 * failed resolve aborts with the culprit ranges before any disk change.
 */
function resolutionConflictError(conflicts: ResolveConflict[]): Error {
  const lines = conflicts.map((c) => `  ${c.module}: ${conflictReason(c)}`);
  return new Error(`Cannot resolve modules:\n${lines.join('\n')}`);
}

/**
 * Handles the module lifecycle of a project: install, update, remove and read.
 */
export class Modules {
  private get logger() {
    return getChildLogger({ module: 'modules' });
  }

  /**
   * Creates an instance of Modules.
   * @param project Project to use.
   * @param fetchCmd Instance of Fetch to use.
   */
  constructor(
    private project: Project,
    private fetchCmd: Fetch,
  ) {}

  /** Temp directory shared between the resolver and the applier. */
  private get tempModulesDir(): string {
    return join(this.project.paths.tempFolder, 'modules');
  }

  /**
   * The single module-update transaction: plan migration replays from the
   * pre-update installation snapshot (a conflict aborts here, before any
   * disk change), apply the staged modules, execute the planned replays,
   * and validate the project when replays actually ran. Plain installs
   * and no-op updates produce no steps and skip both replay and the
   * post-replay validation.
   */
  private async applyResolvedWithReplay(
    resolved: ResolvedModule[],
    backfill: ModuleSetting[] = [],
  ): Promise<void> {
    // Staged trees older than the tool are migrated in place (still in
    // staging); a newer or unversioned tree aborts before any disk change.
    await ensureStagedSchemas(resolved);

    const installedBefore = await installedModulesWithSources(this.project);
    const steps = await planModuleReplays(resolved, installedBefore);

    const appliedModules = await applyModules(this.project, resolved, {
      tempDir: this.tempModulesDir,
      backfill,
    });
    await cleanOrphans(this.project);

    if (steps.length === 0) return;

    // A module whose apply failed still has its old files installed;
    // replaying its chain would cascade changes those files do not
    // reflect. Run replays only for modules that actually landed.
    const { executable, dropped } = filterStepsToApplied(steps, appliedModules);
    for (const step of dropped) {
      console.warn(
        `Skipping migration replay for module '${step.modulePrefix}' ` +
          `(${step.fromVersion} -> ${step.toVersion}): the module failed to apply.`,
      );
    }
    if (executable.length === 0) return;

    await executeModuleReplays(this.project, executable);
    for (const step of executable) {
      console.log(
        `Replayed migrations for module '${step.modulePrefix}': ` +
          `${step.fromVersion} -> ${step.toVersion} (${step.seals.length} seal(s))`,
      );
    }

    const validationErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );
    if (validationErrors.trim().length > 0) {
      throw new ModuleValidationFailedError(validationErrors, executable);
    }
  }

  private collectConstraints(moduleName: string) {
    const constraints: { range: string; source: string }[] = [];
    for (const mod of this.project.configuration.modules) {
      if (mod.name === moduleName && mod.version) {
        constraints.push({ range: mod.version, source: 'project' });
      }
    }
    return constraints;
  }

  /**
   * Installs a module to a project. Copies resources to the project under
   * `.cards/modules/<prefix>/`. Re-installing an already-declared module
   * with the same source updates the declared range rather than erroring.
   *
   * @param source Path to module that will be installed. Git URLs
   *   (`https://…`, `git@…`) and `file:` URLs pass through; bare
   *   filesystem paths are rewritten to `file:<absolute>`.
   * @param options Additional options for module install. Optional.
   *        private: If true, uses credentials to clone the repository
   *        version: Semver version or range (e.g. '1.0.0', '^1.0.0')
   */
  @write((source) => `Import module ${source}`)
  public async install(source: string, options?: ModuleSettingOptions) {
    // Ensure module list is up to date before installing.
    await this.fetchCmd.ensureModuleListUpToDate();

    const beforeImportValidateErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );

    const location = normaliseLocation(source);

    // Early precondition check for file sources: catch bad folder names and
    // missing paths before we hand off to the resolver.
    if (isFileLocation(location)) {
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

    const sourceLayer = createSourceLayer();

    // Pre-fetch only to read `cardKeyPrefix`; the resolver does its own
    // fetch at the ref it picks. We don't hand this tree off as
    // `stagedPath` because it was cloned without a ref (default branch),
    // which silently mis-installs whenever the resolver's pick diverges
    // from the default branch — e.g. a pinned older version.
    const remoteUrl = buildRemoteUrl(
      { location, private: options?.private ?? false },
      options?.credentials,
    );
    // For file: sources we can read `cardsConfig.json` directly from the
    // user's checkout — no need to stage twice (here and again from the
    // resolver). Git sources still need the prefetch clone to discover
    // the prefix before the resolver runs.
    const prefetchPath = isFileLocation(location)
      ? pathResolve(stripFileProtocol(location))
      : await sourceLayer.fetch(
          { location, remoteUrl },
          this.tempModulesDir,
          freshRootStagingName(location),
        );

    const prefetchConfig = await readModuleConfig(prefetchPath);
    const resolvedName = prefetchConfig.cardKeyPrefix;

    // Resolve the declared range. An explicit caller range wins; otherwise
    // pin to `^<latest tagged version>` so re-runs stay on the same major
    // — the npm-install default. Sources without any tags (file sources,
    // unversioned git remotes) fall through with no range and install the
    // default branch.
    let versionRange = options?.version
      ? toVersionRange(options.version)
      : undefined;
    if (!versionRange) {
      const available = await sourceLayer.listRemoteVersions(
        location,
        remoteUrl,
      );
      const latest = pickVersion(available);
      if (latest) {
        versionRange = toVersionRange(`^${latest}`);
      }
    }

    const { plan, resolved, backfill } = await resolveForApply(
      this.project,
      {
        kind: 'add',
        name: resolvedName,
        source: { location, private: options?.private ?? false },
        range: versionRange,
      },
      { credentials: options?.credentials, tempDir: this.tempModulesDir },
    );
    if (!plan.ok) throw resolutionConflictError(plan.conflicts);
    await this.applyResolvedWithReplay(resolved, backfill);

    // Validate the project after module has been installed.
    const afterImportValidateErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );
    if (afterImportValidateErrors.length > beforeImportValidateErrors.length) {
      console.error(
        `There are new validations errors after importing the module. Check the project`,
      );
    }
  }

  /**
   * Updates a specific installed module.
   * @param moduleName Name (prefix) of module to update.
   * @param credentials Optional credentials for a private module.
   * @param version Optional target version to update to.
   * @throws if module is not part of the project
   */
  @write((moduleName) => `Update module ${moduleName}`)
  public async update(
    moduleName: string,
    credentials?: Credentials,
    version?: string,
  ) {
    // Ensure module list is up to date before updating
    await this.fetchCmd.ensureModuleListUpToDate();

    const declared = declaredModules(this.project);
    const target = declared.find((d) => d.name === moduleName);
    if (!target) {
      const installations = await installedModules(this.project);
      const parents = installations
        .filter((m) => m.declaredDependencies.includes(moduleName))
        .map((m) => m.name);
      if (parents.length > 0) {
        const parentList = parents.map((n) => `'${n}'`).join(', ');
        throw new Error(
          `Cannot update module '${moduleName}' because it is required by ${parentList}. Update the parent module(s) instead.`,
        );
      }
      throw new Error(`Module '${moduleName}' is not part of the project`);
    }

    if (version) {
      // Validate the override against any declared ranges for this name.
      const constraints = this.collectConstraints(moduleName);
      if (constraints.length > 0) {
        validateVersionAgainstConstraints(moduleName, version, constraints);
      }

      // Pre-check that the version is actually available on the remote so
      // we surface an actionable error before touching the filesystem.
      const sourceLayer = createSourceLayer();
      const remoteVersions = await sourceLayer.listRemoteVersions(
        target.source.location,
      );
      if (remoteVersions.length > 0 && !remoteVersions.includes(version)) {
        throw new Error(
          `Version '${version}' is not available for module '${moduleName}'. ` +
            `Available versions: ${remoteVersions.join(', ') || 'none'}`,
        );
      }
    }

    const req = version
      ? { kind: 'update' as const, module: moduleName, to: toVersion(version) }
      : { kind: 'update' as const, module: moduleName };
    const { plan, resolved, backfill } = await resolveForApply(
      this.project,
      req,
      {
        credentials,
        tempDir: this.tempModulesDir,
      },
    );
    if (!plan.ok) throw resolutionConflictError(plan.conflicts);
    await this.applyResolvedWithReplay(resolved, backfill);
  }

  /**
   * Updates all installed modules.
   * @param credentials Optional credentials for private modules.
   */
  @write(() => 'Update all modules')
  public async updateAll(credentials?: Credentials) {
    // Ensure module list is up to date before updating all modules
    await this.fetchCmd.ensureModuleListUpToDate();

    const declared = declaredModules(this.project);

    if (declared.length === 0) {
      throw new Error('No modules in the project!');
    }

    const { plan, resolved, backfill } = await resolveForApply(
      this.project,
      { kind: 'updateAll' },
      { credentials, tempDir: this.tempModulesDir },
    );
    if (!plan.ok) throw resolutionConflictError(plan.conflicts);
    await this.applyResolvedWithReplay(resolved, backfill);
  }

  /**
   * Remove a top-level module declaration and cascade orphan cleanup.
   * Transitive-only modules (no top-level declaration) cannot be removed
   * directly — their lifetime is controlled by the parent installation.
   * @param moduleName Name (prefix) of module to remove.
   */
  public async remove(moduleName: string) {
    const declaration = declaredModules(this.project).find(
      (d) => d.name === moduleName,
    );
    if (!declaration) {
      const installations = await installedModules(this.project);
      const parents = installations
        .filter((m) => m.declaredDependencies.includes(moduleName))
        .map((m) => m.name);
      if (parents.length > 0) {
        const parentList = parents.map((n) => `'${n}'`).join(', ');
        throw new Error(
          `Cannot remove module '${moduleName}' because it is required by ${parentList}. Remove the parent module(s) first.`,
        );
      }
      throw new Error(`Module '${moduleName}' is not part of the project`);
    }

    // Delete the top-level declaration from cardsConfig.json.
    await this.project.configuration.removeModule(moduleName);

    // Removes this module's installation (now orphaned) plus any
    // transitives it owned that nothing else references.
    await cleanOrphans(this.project);

    this.logger.info(`Removed module '${moduleName}'`);
  }

  /**
   * Lists all modules (if any) in a project.
   * @returns all modules in a project with their installed versions.
   */
  @read
  public async list(): Promise<ModuleInfo[]> {
    return moduleInfos(this.project);
  }

  /**
   * Shows details of a module.
   * @param moduleName name of a module
   * @returns details of a module.
   */
  @read
  public async show(moduleName: string): Promise<ModuleContent> {
    const moduleDetails = await this.project.module(moduleName);
    if (!moduleDetails) {
      throw new Error(`Module '${moduleName}' does not exist in the project`);
    }
    return moduleDetails;
  }
}
