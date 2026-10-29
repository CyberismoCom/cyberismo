// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve as pathResolve } from 'node:path';

import {
  ModuleConflictError,
  ModuleRequestError,
  redactUserinfo,
  unreachable,
  WorkspaceDisposedError,
} from '../shared/exceptions/index.js';
import { isValidFolderName, pathExists } from '../shared/utils/file-utils.js';
import { readJsonFile } from '../shared/utils/json.js';
import { getChildLogger } from '../shared/utils/log-utils.js';
import { read, write } from '../infra/tx/rw-lock.js';
import { Validate } from '../domain/validation/index.js';
import {
  Fetch,
  MODULE_LIST_FULL_PATH,
  type ModuleListFile,
} from '../state/checkout/hub-store.js';

import {
  applyModules,
  buildRemoteUrl,
  checkUpdate,
  requireDeclared,
  conflictReason,
  declaredModules,
  ensureStagedSchemas,
  installedModules,
  installedModulesWithSources,
  moduleInfos,
  resolveUpdate,
  projectModules,
  resolveForApply,
  stageResolution,
  toUpdatePlan,
  createSourceLayer,
  FILE_PROTOCOL,
  isFileLocation,
  isGitLocation,
  stripFileProtocol,
  pickVersion,
  toDeclaredRange,
  toVersionRange,
} from '../domain/modules/index.js';
import { readModuleConfig } from '../infra/paths/cards-config.js';
import { moduleFingerprint } from '../domain/modules/index.js';
import { cleanOrphans } from '../domain/modules/index.js';
import {
  executeModuleReplays,
  filterStepsToApplied,
  ModuleReplayFailedError,
  ModuleValidationFailedError,
  planModuleReplays,
  type ReplayStep,
} from '../domain/resources/index.js';

import type {
  ActorRef,
  Credentials,
  HubDetails,
  HubFetchFailure,
  HubSetting,
  ModuleContent,
  ModuleInfo,
  ModuleInstallResult,
  ModuleSetting,
  ModuleSettingFromHub,
  ModuleSettingOptions,
  ModuleUpdateResult,
  ProjectModuleInfo,
  ReplayedModule,
  Source,
  UpdatePlan,
  UpdateTarget,
} from '@cyberismo/model';
import type { Checkout } from '../state/checkout/checkout.js';
import type { CommitIdentity } from '../infra/tx/tx-record.js';
import type { ResolveConflict } from '../domain/modules/index.js';
import type { ResolvedModule } from '../domain/resources/index.js';
import type { SourceLayer } from '../infra/modules/source.js';
import type { CheckedTarget } from '../domain/modules/index.js';

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
  return new ModuleRequestError(`Cannot resolve modules:\n${lines.join('\n')}`);
}

/** What phase 2 of a module operation hands to its apply. */
interface Staged {
  /** {@link moduleFingerprint} as phase 1 saw it. */
  fingerprint: string;
  resolved: ResolvedModule[];
  backfill: ModuleSetting[];
  /** The operation's own staging directory. */
  tempDir: string;
}

/**
 * The modules and hubs of one handle: install, update, remove and read.
 * Writes through it are the handle's actor's. Holds no state of its own.
 */
export class Modules {
  private get logger() {
    return getChildLogger({ module: 'modules' });
  }

  private readonly fetchCmd: Fetch;

  /** @internal */
  constructor(
    private readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {
    this.fetchCmd = new Fetch(checkout);
  }

  /** Parent of the per-operation staging directories. */
  private get tempModulesDir(): string {
    return join(this.checkout.paths.tempFolder, 'modules');
  }

  // Network work stages into a directory of its own, so concurrent
  // operations never clone over each other's trees.
  private async inOperationDir<T>(fn: (dir: string) => Promise<T>) {
    await mkdir(this.tempModulesDir, { recursive: true });
    const dir = await mkdtemp(join(this.tempModulesDir, 'op-'));
    try {
      return await fn(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private assertLive() {
    if (this.checkout.disposed) throw new WorkspaceDisposedError();
  }

  // Phase 1: the module state the network work is based on.
  private async fingerprint(): Promise<string> {
    this.assertLive();
    return moduleFingerprint(this.checkout);
  }

  // Phase 3: that state must still hold; no retry.
  private async assertUnchanged(fingerprint: string) {
    this.assertLive();
    if ((await moduleFingerprint(this.checkout)) !== fingerprint) {
      throw new ModuleConflictError();
    }
  }

  /**
   * The single module-update transaction: plan migration replays from the
   * pre-update installation snapshot (a conflict aborts here, before any
   * disk change), apply the staged modules, execute the planned replays,
   * and validate the project when replays actually ran. Plain installs
   * and no-op updates produce no steps and skip both replay and the
   * post-replay validation.
   */
  private async applyResolvedWithReplay({
    resolved,
    backfill,
    tempDir,
  }: Staged): Promise<ModuleUpdateResult> {
    const result: ModuleUpdateResult = { replayed: [], skippedReplays: [] };
    const installedBefore = await installedModulesWithSources(this.checkout);
    const steps = await planModuleReplays(resolved, installedBefore);

    const appliedModules = await applyModules(this.checkout, resolved, {
      tempDir,
      backfill,
    });
    const modules = this.checkout.lock.currentTx()?.touched.modules;
    // Backfilled modules keep their files; their declarations changed.
    for (const name of [...appliedModules, ...backfill.map((m) => m.name)]) {
      modules?.add(name);
    }
    await cleanOrphans(this.checkout, {
      onRemove: (installation) => modules?.add(installation.name),
    });

    if (steps.length === 0) return result;

    // A module whose apply failed still has its old files installed;
    // replaying its chain would cascade changes those files do not
    // reflect. Run replays only for modules that actually landed.
    const { executable, dropped } = filterStepsToApplied(steps, appliedModules);
    result.skippedReplays = dropped.map(
      ({ modulePrefix, fromVersion, toVersion }) => ({
        modulePrefix,
        fromVersion,
        toVersion,
      }),
    );
    if (executable.length === 0) return result;

    try {
      await executeModuleReplays(this.checkout, executable);
    } catch (error) {
      if (error instanceof ModuleReplayFailedError) error.result = result;
      throw error;
    }
    result.replayed = executable.map(replayedModule);

    const validationErrors = await Validate.getInstance().validate(
      this.checkout.basePath,
      () => this.checkout,
    );
    if (validationErrors.trim().length > 0) {
      throw new ModuleValidationFailedError(
        validationErrors,
        executable,
        result,
      );
    }
    return result;
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
  public async install(
    source: string,
    options?: ModuleSettingOptions,
  ): Promise<ModuleInstallResult> {
    const { location, isPrivate, fingerprint } = await this.checkout.lock.read(
      async () => {
        // A hub module's name wins over a path of the same name. It is looked
        // up before the refresh, so a name the cached list lacks is a path.
        const hubModule = await this.hubModule(source);
        const isPrivate = options?.private ?? hubModule?.private ?? false;
        const location = normaliseLocation(hubModule?.location ?? source);

        // Early precondition check for file sources: catch bad folder names
        // and missing paths before we hand off to the resolver.
        if (isFileLocation(location)) {
          const folder = location.substring(FILE_PROTOCOL.length);
          if (!isValidFolderName(folder)) {
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
        return { location, isPrivate, fingerprint: await this.fingerprint() };
      },
    );

    return this.inOperationDir(async (tempDir) => {
      // Ensure module list is up to date before installing.
      await this.fetchCmd.ensureModuleListUpToDate();

      const sourceLayer = createSourceLayer();
      let staged: Pick<Staged, 'resolved' | 'backfill'>;
      try {
        staged = await this.stageInstall(
          sourceLayer,
          location,
          isPrivate,
          tempDir,
          options,
        );
      } finally {
        await sourceLayer.dispose?.();
      }
      this.assertLive();
      return this.applyInstall(source, { fingerprint, tempDir, ...staged });
    });
  }

  // Phase 2 of install: no lock.
  private async stageInstall(
    sourceLayer: SourceLayer,
    location: string,
    isPrivate: boolean,
    tempDir: string,
    options?: ModuleSettingOptions,
  ): Promise<Pick<Staged, 'resolved' | 'backfill'>> {
    // Pre-fetch only to read `cardKeyPrefix`; the resolver does its own
    // fetch at the ref it picks. We don't hand this tree off as
    // `stagedPath` because it was cloned without a ref (default branch),
    // which silently mis-installs whenever the resolver's pick diverges
    // from the default branch — e.g. a pinned older version.
    const remoteUrl = buildRemoteUrl(
      { location, private: isPrivate },
      options?.credentials,
    );
    // For file: sources we can read `cardsConfig.json` directly from the
    // user's checkout — no need to stage twice (here and again from the
    // resolver). Git sources still need the prefetch clone to discover
    // the prefix before the resolver runs.
    const prefetchPath = isFileLocation(location)
      ? pathResolve(stripFileProtocol(location))
      : await sourceLayer
          .fetch(
            { location, remoteUrl },
            tempDir,
            freshRootStagingName(location),
          )
          .catch((error) => {
            throw unreachable(redactUserinfo(location), error, 'fetch module');
          });

    const prefetchConfig = await readModuleConfig(prefetchPath);
    const resolvedName = prefetchConfig.cardKeyPrefix;

    // Resolve the declared range. An explicit caller range wins; otherwise
    // pin to `^<latest tagged version>` so re-runs stay on the same major
    // — the npm-install default. Sources without any tags (file sources,
    // unversioned git remotes) fall through with no range and install the
    // default branch.
    let versionRange = options?.version
      ? toDeclaredRange(options.version)
      : undefined;
    if (!versionRange) {
      const available = await sourceLayer
        .listRemoteVersions(location, remoteUrl)
        .catch((error) => {
          throw unreachable(redactUserinfo(location), error, 'list versions');
        });
      const latest = pickVersion(available);
      if (latest) {
        versionRange = toVersionRange(`^${latest}`);
      }
    }

    const { plan, resolved, backfill } = await resolveForApply(
      this.checkout,
      {
        kind: 'add',
        name: resolvedName,
        source: { location, private: isPrivate },
        range: versionRange,
      },
      { credentials: options?.credentials, tempDir },
    );
    if (!plan.ok) throw resolutionConflictError(plan.conflicts);
    // Staged trees older than the tool are migrated in place (still in
    // staging); a newer or unversioned tree aborts before any disk change.
    await ensureStagedSchemas(resolved);
    return { resolved, backfill };
  }

  // Phase 3 of install, under the write the commit is named for.
  @write((source: string) => `Import module ${source}`)
  private async applyInstall(
    source: string,
    staged: Staged,
  ): Promise<ModuleInstallResult> {
    await this.assertUnchanged(staged.fingerprint);
    const beforeImportValidateErrors = await Validate.getInstance().validate(
      this.checkout.basePath,
      () => this.checkout,
    );
    const result = await this.applyResolvedWithReplay(staged);

    // Validate the project after module has been installed.
    const afterImportValidateErrors = await Validate.getInstance().validate(
      this.checkout.basePath,
      () => this.checkout,
    );
    return {
      ...result,
      newValidationErrors:
        afterImportValidateErrors.length > beforeImportValidateErrors.length,
    };
  }

  // The module the cached hub data offers under `name`, if any.
  private async hubModule(name: string): Promise<ModuleSetting | undefined> {
    try {
      const moduleList = (await readJsonFile(
        pathResolve(this.checkout.basePath, MODULE_LIST_FULL_PATH),
      )) as ModuleListFile;
      return moduleList.modules?.find((module) => module.name === name);
    } catch (error) {
      // No list yet (hubs never fetched) is normal; an unreadable one is not.
      const cause = (error as Error).cause as NodeJS.ErrnoException | undefined;
      if (cause?.code !== 'ENOENT') {
        this.logger.warn(error, 'Unreadable module list; not a hub module');
      }
      return undefined;
    }
  }

  /**
   * What {@link update} would do for `target`, without fetching a module
   * tree or writing anything.
   * @param target Module and optional version; no module means every root.
   * @param credentials Optional credentials for private modules.
   */
  public async planUpdate(
    target: UpdateTarget,
    credentials?: Credentials,
  ): Promise<UpdatePlan> {
    const { checked, fingerprint } = await this.checkUpdate(target);
    const source = createSourceLayer();
    try {
      const resolution = await resolveUpdate(this.checkout, checked, {
        source,
        credentials,
      });
      return await this.checkout.lock.read(async () => {
        await this.assertUnchanged(fingerprint);
        return toUpdatePlan(this.checkout, resolution);
      });
    } finally {
      await source.dispose?.();
    }
  }

  // Phase 1 of update and its dry run.
  private checkUpdate(target: UpdateTarget) {
    return this.checkout.lock.read(async () => ({
      checked: await checkUpdate(this.checkout, target),
      fingerprint: await this.fingerprint(),
    }));
  }

  /**
   * Updates one declared module, or every declared root when `target` names
   * none.
   * @param target Module and optional version; no module means every root.
   * @param credentials Optional credentials for private modules.
   * @throws if the module is not part of the project, or the update is blocked
   */
  public async update(
    target: UpdateTarget,
    credentials?: Credentials,
  ): Promise<ModuleUpdateResult> {
    const { checked, fingerprint } = await this.checkUpdate(target);
    return this.inOperationDir(async (tempDir) => {
      // Ensure module list is up to date before updating
      await this.fetchCmd.ensureModuleListUpToDate();
      const staged = await this.stageUpdate(checked, tempDir, credentials);
      this.assertLive();
      return this.applyUpdate(target, { fingerprint, tempDir, ...staged });
    });
  }

  // Phase 2 of update: no lock.
  private async stageUpdate(
    checked: CheckedTarget,
    tempDir: string,
    credentials?: Credentials,
  ): Promise<Pick<Staged, 'resolved' | 'backfill'>> {
    const source = createSourceLayer();
    try {
      const resolution = await resolveUpdate(this.checkout, checked, {
        source,
        credentials,
      });
      if (!resolution.result.ok) {
        throw resolutionConflictError(resolution.result.conflicts);
      }
      const { resolved, backfill } = await stageResolution(
        this.checkout,
        resolution,
        {
          source,
          credentials,
          tempDir,
        },
      );
      await ensureStagedSchemas(resolved);
      return { resolved, backfill };
    } finally {
      await source.dispose?.();
    }
  }

  // Phase 3 of update, under the write the commit is named for.
  @write((target: UpdateTarget) =>
    target.module ? `Update module ${target.module}` : 'Update all modules',
  )
  private async applyUpdate(
    target: UpdateTarget,
    staged: Staged,
  ): Promise<ModuleUpdateResult> {
    await this.assertUnchanged(staged.fingerprint);
    return this.applyResolvedWithReplay(staged);
  }

  /**
   * Remove a top-level module declaration and cascade orphan cleanup.
   * Transitive-only modules (no top-level declaration) cannot be removed
   * directly — their lifetime is controlled by the parent installation.
   * @param moduleName Name (prefix) of module to remove.
   */
  public async remove(moduleName: string) {
    // Ensure module list is up to date when removing modules
    await this.fetchCmd.ensureModuleListUpToDate();
    await this.removeDeclared(moduleName);
  }

  @write((moduleName: string) => `Remove module ${moduleName}`)
  private async removeDeclared(moduleName: string) {
    this.assertLive();
    const declaration = declaredModules(this.checkout).find(
      (d) => d.name === moduleName,
    );
    if (!declaration) {
      const installations = await installedModules(this.checkout);
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
    await this.checkout.configuration.removeModule(moduleName);
    const modules = this.checkout.lock.currentTx()?.touched.modules;
    modules?.add(moduleName);

    // Removes this module's installation (now orphaned) plus any
    // transitives it owned that nothing else references.
    await cleanOrphans(this.checkout, {
      onRemove: (installation) => modules?.add(installation.name),
    });

    this.logger.info(`Removed module '${moduleName}'`);
  }

  /**
   * Lists all modules (if any) in a project.
   * @returns all modules in a project with their installed versions.
   */
  @read
  public async list(): Promise<ModuleInfo[]> {
    return moduleInfos(this.checkout);
  }

  /**
   * Lists installed modules with their declared range, dependents and where
   * their versions come from.
   */
  @read
  public async inventory(): Promise<ProjectModuleInfo[]> {
    return projectModules(this.checkout);
  }

  /**
   * Lists the versions a declared module's source offers, newest first.
   * @param target A declared module, or a git source not yet in the project.
   * @param credentials Optional credentials for private modules.
   * @throws {ModuleRequestError} if the module is unknown or transitive, or
   * the source cannot be listed
   */
  public async listVersions(
    target: { module: string } | { source: string },
    credentials?: Credentials,
  ): Promise<string[]> {
    let source: Source;
    if ('source' in target) {
      source = { location: normaliseLocation(target.source), private: false };
    } else {
      source = await this.checkout.lock.read(
        async () =>
          (await requireDeclared(this.checkout, target.module)).source,
      );
    }
    const layer = createSourceLayer();
    try {
      return await layer.listRemoteVersions(
        source.location,
        buildRemoteUrl(source, credentials),
      );
    } catch (error) {
      if (!('source' in target))
        throw unreachable(target.module, error, 'list versions');
      throw new ModuleRequestError(
        `Couldn't list versions of '${redactUserinfo(target.source)}'`,
        error instanceof Error ? redactUserinfo(error.message) : undefined,
      );
    } finally {
      await layer.dispose?.();
    }
  }

  /**
   * Shows details of a module.
   * @param moduleName name of a module
   * @returns details of a module.
   */
  @read
  public async show(moduleName: string): Promise<ModuleContent> {
    const moduleDetails = await this.checkout.module(moduleName);
    if (!moduleDetails) {
      throw new Error(`Module '${moduleName}' does not exist in the project`);
    }
    return moduleDetails;
  }

  /**
   * Shows importable modules.
   * @param showAll - When true, shows all importable modules, even if they have already been imported
   * @param showDetails - When true, shows all properties of modules, not just name.
   * @returns list of modules; the list content depends on the parameters provided
   *          by default it is a list of module names that could be imported into the project,
   *          with 'showDetails' true, instead of name, the list consists of full details of the modules
   *          with 'showAll' true, the list consists of all modules in the hubs, even if they have already been imported
   *          Note that the two boolean options can be combined.
   * @note Reads the cached hub data as-is; refreshing it is the caller's call.
   */
  @read
  public async importable(
    showAll?: boolean,
    showDetails?: boolean,
  ): Promise<ModuleSettingFromHub[]> {
    try {
      const moduleList = (
        await readJsonFile(
          pathResolve(this.checkout.basePath, MODULE_LIST_FULL_PATH),
        )
      ).modules;
      const currentModules = this.checkout.resources.moduleNames();
      const nonImportedModules = moduleList.filter(
        (item: ModuleSettingFromHub) => {
          return !currentModules.some((module) => item.name === module);
        },
      );

      if (showAll && showDetails) {
        return moduleList;
      }
      if (showAll) {
        return moduleList?.map((item: ModuleSettingFromHub) => item?.name);
      }
      if (showDetails) {
        return nonImportedModules;
      }
      // By default return the non-imported modules
      return nonImportedModules.map((item: ModuleSettingFromHub) => item?.name);
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(error.message);
      }
      // Module list doesn't exist, return empty list
      return [];
    }
  }

  /**
   * Shows hubs of the project.
   * @returns list of hubs.
   */
  @read
  public async hubs(): Promise<HubSetting[]> {
    return this.checkout.configuration.hubs;
  }

  /**
   * Shows hubs of the project with the modules available from each hub.
   * @returns list of hubs with their available modules.
   * @note Reads the cached hub data as-is; refreshing it is the caller's call.
   */
  @read
  public async hubDetails(): Promise<HubDetails[]> {
    let cachedHubs: ModuleListFile['hubs'] = [];
    try {
      const moduleList = (await readJsonFile(
        pathResolve(this.checkout.basePath, MODULE_LIST_FULL_PATH),
      )) as ModuleListFile;
      cachedHubs = moduleList.hubs ?? [];
    } catch (error) {
      this.logger.info(
        error,
        'No readable module list; showing hubs without modules',
      );
    }

    return this.checkout.configuration.hubs.map((hub) => {
      const cached = cachedHubs.find((item) => item.location === hub.location);
      return {
        location: hub.location,
        displayName: hub.displayName ?? cached?.displayName,
        description: hub.description ?? cached?.description,
        modules: (cached?.modules ?? []) as ModuleSettingFromHub[],
      };
    });
  }

  /**
   * Fetches the hubs' module lists into the cache; only hubs with a newer
   * version unless 'force' is set.
   * @returns the hubs that could not be read, in configuration order.
   */
  public async fetchHubs(force: boolean = false): Promise<HubFetchFailure[]> {
    return this.fetchCmd.fetchHubs(force);
  }

  /**
   * Ensures the module list is up to date by fetching if needed.
   * @returns the hubs that could not be read.
   */
  public async ensureModuleListUpToDate(): Promise<HubFetchFailure[]> {
    return this.fetchCmd.ensureModuleListUpToDate();
  }

  /** Fetches hub data only when no local cache exists yet. */
  public async ensureModuleListExists(): Promise<void> {
    return this.fetchCmd.ensureModuleListExists();
  }
}

function replayedModule(step: ReplayStep): ReplayedModule {
  return {
    modulePrefix: step.modulePrefix,
    fromVersion: step.fromVersion,
    toVersion: step.toVersion,
    seals: step.seals.length,
    retired: step.seals.flatMap((s) => s.skipped.retired),
    unknown: step.seals.flatMap((s) => s.skipped.unknown),
  };
}
