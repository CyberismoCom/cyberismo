/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
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
import { mkdir, readdir, rm } from 'node:fs/promises';

import { simpleGit, type SimpleGit } from 'simple-git';

import { copyDir, deleteDir, pathExists } from './utils/file-utils.js';
import { GitManager } from './utils/git-manager.js';
import type {
  Credentials,
  ModuleSetting,
  ModuleSettingOptions,
} from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';
import type { ProjectConfiguration } from './project-settings.js';
import { ProjectPaths } from './containers/project/project-paths.js';
import { readJsonFile } from './utils/json.js';
import { Validate } from './commands/validate.js';

const FILE_PROTOCOL = 'file:';
const HTTPS_PROTOCOL = 'https:';

// When dependencies are built to a map, use map that has
//   key: module name,
//   value: list of unique prefixes
type DependencyGraph = Map<string, Set<string>>;

/**
 * Class that handles module updates and imports.
 */
export class ModuleManager {
  private modules: ModuleSetting[] = [];
  // Map of module name -> git tag to check out for that module. Pre-seeded
  // by callers that know an exact target (e.g. the per-import
  // `semver.maxSatisfying` step in `commands/import.ts`) and consumed by
  // clone(). Graph-wide constraint intersection used to write into this
  // map; that logic has been deleted and is deferred to a future ASP pass
  // per `module-system.allium`.
  private moduleRefs: Map<string, string> = new Map();
  private tempModulesDir: string = '';

  constructor(private project: Project) {
    this.tempModulesDir = join(this.project.paths.tempFolder, 'modules');
  }

  // Copies module files into project directories.
  private async addFileContents(sourcePath: string, destinationPath: string) {
    // Copy files.
    await copyDir(sourcePath, destinationPath);

    // Update the resources.
    this.project.resources.changedModules();
  }

  // Creates a map of what dependencies each module depend from.
  private async buildDependencyGraph(
    dependencies: ModuleSetting[],
  ): Promise<DependencyGraph> {
    const dependencyNames = dependencies.map((item) => item.name);
    const dependencyGraph = new Map<string, Set<string>>() as DependencyGraph;
    for (const dependency of dependencyNames) {
      dependencyGraph.set(
        dependency,
        await this.transientDependencies(dependency),
      );
    }
    return dependencyGraph;
  }

  // Returns 'true' if 'moduleName' can be removed.
  private canBeRemoved(
    dependencies: DependencyGraph,
    moduleName: string,
  ): boolean {
    let unused = true;
    dependencies.forEach((transientDependencies, key) => {
      if (key !== moduleName && transientDependencies.has(moduleName)) {
        unused = false;
      }
    });
    return unused;
  }

  // Builds the remote URL for a module, applying credentials if needed.
  private buildRemoteUrl(
    module: ModuleSetting,
    credentials?: Credentials,
  ): string {
    if (
      module.private &&
      credentials?.username &&
      credentials?.token &&
      module.location.startsWith(HTTPS_PROTOCOL)
    ) {
      try {
        const repoUrl = new URL(module.location);
        const user = credentials.username;
        const pass = credentials.token;
        const host = repoUrl.host;
        const path = repoUrl.pathname;
        return `https://${user}:${pass}@${host}${path}`;
      } catch {
        throw new Error(`Invalid repository URL: ${module.location}`);
      }
    }
    return module.location;
  }

  // Handles cloning of a repository. If 'ref' is provided, it takes precedence
  // over any entry in this.moduleRefs; with no ref, the module's default
  // branch is cloned.
  private async clone(
    module: ModuleSetting,
    verbose: boolean = true,
    credentials?: Credentials,
    ref?: string,
  ): Promise<string> {
    if (!module.name || module.name === '') {
      module.name = this.repositoryName(module.location);
    }

    const destinationPath = join(this.tempModulesDir, module.name);
    const effectiveRef = ref ?? this.moduleRefs.get(module.name);

    const remote = this.buildRemoteUrl(module, credentials);
    if (verbose) {
      const protocol =
        module.private && remote !== module.location
          ? 'HTTPS with credentials'
          : module.private && module.location.startsWith('git@')
            ? 'SSH'
            : 'HTTPS without credentials';
      console.log(`... Using ${protocol} for cloning '${module.name}'`);
    }

    try {
      await mkdir(this.tempModulesDir, { recursive: true });
      const cloneOptions = this.setCloneOptions(effectiveRef);
      await rm(destinationPath, { recursive: true, force: true });

      const git: SimpleGit = simpleGit({
        timeout: {
          block: this.gitTimeout(),
        },
      });

      await git
        // turn off git prompts
        .env({ GIT_TERMINAL_PROMPT: 0, GCM_INTERACTIVE: 'never' })
        .clone(remote, destinationPath, cloneOptions);

      if (verbose) {
        console.log(`... Cloned '${module.name}' to a temporary folder`);
      }
    } catch (error) {
      if (error instanceof Error)
        throw new Error(
          `Failed to clone module '${module.name}': ${error.message}`,
          { cause: error },
        );
    }

    return module.name;
  }

  // Collects all module prefixes from module hierarchy into 'this.modules'.
  // Note that collected result can contain duplicates.
  private async collectModulePrefixes(
    modules: ModuleSetting[],
    credentials?: Credentials,
  ) {
    if (modules) {
      for (const module of modules) {
        await this.doCollectModulePrefix(module, credentials);
      }
    }
  }

  // Read project configuration JSON file from 'path'.
  private async configuration(path: string): Promise<ProjectConfiguration> {
    try {
      const paths = new ProjectPaths(path);
      return readJsonFile(paths.configurationFile);
    } catch {
      throw new Error(`Module not found from '${path}'`);
    }
  }

  // Fetches direct dependencies of a module.
  private async dependencies(moduleName: string): Promise<Set<string>> {
    const module = await this.project.module(moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }
    const moduleConfiguration = (await readJsonFile(
      this.project.paths.moduleConfigurationFile(moduleName),
    )) as ProjectConfiguration;
    return moduleConfiguration.modules
      ? new Set(moduleConfiguration.modules.map((m) => m.name))
      : new Set();
  }

  // Increase timeout for CI environments and add platform-specific adjustments
  private gitTimeout(): number {
    const baseTimeout = 15000;
    const isCI = process.env.CI;
    const isWindows = process.platform === 'win32';

    let timeout = baseTimeout;
    if (isCI) timeout *= 2; // Double timeout in CI
    if (isWindows) timeout *= 1.5; // 50% more time on Windows

    return timeout;
  }

  // Collects one module's dependency prefixes to 'this.modules'.
  // Note that there can be duplicate entries.
  private async doCollectModulePrefix(
    module: ModuleSetting,
    credentials?: Credentials,
  ) {
    let moduleRoot: string;
    if (this.isFileModule(module)) {
      const urlStart = FILE_PROTOCOL.length;
      // Remove 'file:' from location
      moduleRoot = module.location.substring(urlStart, module.location.length);
    } else {
      await this.clone(module, false, credentials);
      moduleRoot = join(this.tempModulesDir, module.name);
    }

    this.modules.push(module);

    const configuration = await this.configuration(moduleRoot);

    await this.collectModulePrefixes(configuration.modules, credentials);
  }

  // Updates one module that is read from local file system.
  private async handleFileModule(module: ModuleSetting) {
    this.stripProtocolFromLocation(module);
    await this.remove(module);
    await this.importFromFolder(module.location, module.name);
    await this.persistModuleVersion(module);
  }

  // Updates one module that is received from Git.
  private async handleGitModule(module: ModuleSetting) {
    await this.clone(module);
    const tempLocation = join(this.tempModulesDir, module.name);
    await this.remove(module);
    await this.importFromFolder(tempLocation, module.name);
    await this.persistModuleVersion(module);
  }

  // Updates one module.
  private async handleModule(module: ModuleSetting) {
    return this.isGitModule(module)
      ? this.handleGitModule(module)
      : this.handleFileModule(module);
  }

  // Reads the version from a module's cardsConfig.json.
  public async readModuleVersion(
    moduleName: string,
  ): Promise<string | undefined> {
    const configPath = this.project.paths.moduleConfigurationFile(moduleName);
    try {
      const config = await readJsonFile(configPath);
      return config?.version;
    } catch {
      return undefined;
    }
  }

  // Persists the version range constraint for a module in the project config.
  // The installed version is not stored in the project config — it is read
  // from the module's own cardsConfig.json at runtime.
  private async persistModuleVersion(module: ModuleSetting) {
    if (module.version) {
      await this.project.configuration.updateModuleVersion(
        module.name,
        module.version,
      );
    }
  }

  // Imports from a given folder. Is used both for .temp/<module name> and file locations.
  private async importFromFolder(path: string, name: string) {
    await this.importFileModule(path, undefined, true); // Skip validation during updates
    console.log(
      `... Imported module '${name}' to '${this.project.configuration.name}'`,
    );
  }

  // Returns true if module is imported from file-system.
  private isFileModule(module: ModuleSetting): boolean {
    if (!module.location) return false;
    return module.location.startsWith('file:');
  }

  // Returns true if module is imported from git.
  private isGitModule(module: ModuleSetting): boolean {
    if (!module.location) return false;
    return (
      module.location.startsWith('https:') || module.location.startsWith('git@')
    );
  }

  // Collect modules that could be removed from .cards/modules when
  // 'moduleName' is removed.
  private orphanedModules(
    dependencies: DependencyGraph,
    moduleName: string,
  ): string[] {
    const projectModules = this.project.configuration.modules;
    const removableTransientModules: string[] = [];
    if (dependencies.has(moduleName)) {
      const deps = dependencies.get(moduleName);
      for (const dependency of deps!) {
        const projectDependency = projectModules.some(
          (item) => item.name === dependency,
        );
        if (projectDependency) continue;

        let orphanModule = true;
        dependencies.forEach((transientDependencies, key) => {
          if (key === moduleName) return;
          if (transientDependencies.has(dependency)) {
            orphanModule = false;
          }
        });

        if (orphanModule) {
          removableTransientModules.push(dependency);
        }
      }
    }
    return removableTransientModules;
  }

  // Prepares '.temp/modules' for cloning
  private async prepare() {
    try {
      await mkdir(this.tempModulesDir, { recursive: true });
      const files = await readdir(this.tempModulesDir);
      for (const file of files) {
        const filePath = join(this.tempModulesDir, file);
        await rm(filePath, {
          force: true,
          recursive: true,
        });
      }
    } catch (error) {
      throw new Error(`Failed to prepare temporary directory: ${error}`, {
        cause: error,
      });
    }
  }

  // Handles removing an imported module.
  private async remove(module: ModuleSetting) {
    try {
      await this.removeModuleFiles(module.name);
      console.log(`... Removed imported module '${module.name}'`);

      // Refresh module resources in cache after filesystem removal to avoid stale prefixes
      this.project.resources.changedModules();
    } catch (error) {
      if (error instanceof Error)
        console.error(
          `... New imported module '${module.name}', skipping remove`,
        );
    }
  }

  // Checks for duplicate ModuleSetting entries and throws an error if modules
  // with the same name have different locations or access modes.
  // Returns an array with duplicate entries removed.
  private removeDuplicates(modules: ModuleSetting[]): ModuleSetting[] {
    const moduleMap = new Map<string, ModuleSetting>();

    for (const module of modules) {
      const existingModule = moduleMap.get(module.name);
      if (existingModule) {
        if (Boolean(existingModule.private) !== Boolean(module.private)) {
          throw new Error(
            `Module conflict: '${module.name}' has different access:\n` +
              `  - ${Boolean(existingModule.private)}\n` +
              `  - ${Boolean(module.private)}`,
          );
        }
        if (existingModule.location !== module.location) {
          throw new Error(
            `Module conflict: '${module.name}' has different locations:\n` +
              `  - ${existingModule.location}\n` +
              `  - ${module.location}`,
          );
        }
      } else {
        moduleMap.set(module.name, module);
      }
    }
    return Array.from(moduleMap.values());
  }

  // Remove module files.
  private async removeModuleFiles(moduleName: string) {
    const module = await this.project.module(moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }
    await deleteDir(module.path);
  }

  // Gets repository name from gitUrl
  private repositoryName(gitUrl: string): string {
    const last = gitUrl.lastIndexOf('/');
    const repoName = gitUrl.substring(last + 1, gitUrl.length - 4); //remove trailing ".git"
    return repoName;
  }

  // Returns git clone options, pinning to 'ref' (a tag or branch) when given.
  // With no ref, clones the repository's default branch.
  private setCloneOptions(ref?: string): string[] {
    const cloneOptions = ['--depth', '1'];
    if (ref) {
      cloneOptions.push('--branch', ref);
    }
    return cloneOptions;
  }

  // Updates module's 'location' not to have 'protocol:' in the beginning (only for "file:" needed).
  private stripProtocolFromLocation(module: ModuleSetting) {
    const protocol = this.isFileModule(module) ? 'file' : 'git';
    module.location = module.location.substring(
      protocol.length + 1,
      module.location.length,
    );
  }

  // Fetches all dependencies for a module.
  private async transientDependencies(
    moduleName: string,
  ): Promise<Set<string>> {
    const dependencies = await this.dependencies(moduleName);
    let transientDependencies: Set<string> = new Set(dependencies);
    for (const dependency of dependencies) {
      const depTransients = await this.transientDependencies(dependency);
      transientDependencies = new Set([
        ...transientDependencies,
        ...depTransients,
      ]);
    }

    return transientDependencies;
  }

  // Updates modules in the project.
  private async update(
    module?: ModuleSetting,
    credentials?: Credentials,
    skipModules?: Set<string>,
    targetRefs?: Map<string, string>,
  ) {
    // Prints dots every half second so that user knows that something is ongoing
    function start() {
      console.log('... Collecting unique modules. This takes a moment.');
      return setInterval(() => process.stdout.write(`.`), 500);
    }

    // Stops the above, and shows results
    function finished(interval: NodeJS.Timeout, modules: string[]) {
      clearInterval(interval);
      if (modules.length > 0) {
        console.log(`\n... Found modules: ${modules.join(', ')}`);
      }
    }

    await this.prepare();
    this.moduleRefs.clear();
    if (targetRefs) {
      for (const [name, ref] of targetRefs) {
        this.moduleRefs.set(name, ref);
      }
    }

    let modules = module ? [module] : this.project.configuration.modules;
    if (modules.length === 0) {
      throw new Error(`No modules in the project!`);
    }

    modules = modules.filter((module) => this.isGitModule(module));

    const dotInterval = start();

    let uniqueModules: ModuleSetting[] = [];
    try {
      await this.collectModulePrefixes(modules, credentials);
      uniqueModules = this.removeDuplicates(this.modules);

      // Graph-wide constraint intersection used to live here. It has been
      // deleted per `module-system.allium`; per-module clone-at-tag is
      // still driven by `targetRefs` (pre-seeded by the caller) and by the
      // per-import `semver.maxSatisfying` step in `commands/import.ts`.
    } finally {
      finished(
        dotInterval,
        uniqueModules.map((item) => item.name),
      );

      // Filter out modules that are already imported (but not if version resolution
      // determined a different version than what's installed)
      const modulesToImport = skipModules
        ? uniqueModules.filter((module) => !skipModules.has(module.name))
        : uniqueModules;

      if (
        skipModules &&
        skipModules.size > 0 &&
        modulesToImport.length < uniqueModules.length
      ) {
        const skippedModules = uniqueModules
          .filter((module) => skipModules.has(module.name))
          .map((m) => m.name)
          .join(', ');
        console.log(
          `... Skipping already imported module(s): ${skippedModules}`,
        );
      }

      // Update modules parallel.
      const promises: Promise<void>[] = [];
      modulesToImport.forEach((module) =>
        promises.push(this.handleModule(module)),
      );
      await Promise.all(promises);
      await deleteDir(this.tempModulesDir);
      this.project.resources.changedModules();
    }
  }

  // Checks that module prefix is not in use in the project
  // Optionally skip check for modules that are already imported (during updates)
  private validatePrefix(modulePrefix: string, skipIfExists = false) {
    // Do not allow modules with same prefixes.
    const currentlyUsedPrefixes = this.project.projectPrefixes();
    if (currentlyUsedPrefixes.includes(modulePrefix)) {
      // If skipIfExists is true, allow re-importing modules that are already present
      if (skipIfExists) {
        return;
      }
      throw new Error(
        `Imported project has a prefix '${modulePrefix}' that is already used in the project. Cannot import from module.`,
      );
    }
  }

  /**
   * Lists available version tags for a module from its remote repository.
   * @param module Module to query versions for.
   * @param credentials Optional credentials for private repositories.
   * @returns Semver version strings sorted descending (e.g. ["2.1.0", "1.0.0"])
   */
  public async listAvailableVersions(
    module: ModuleSetting,
    credentials?: Credentials,
  ): Promise<string[]> {
    if (!this.isGitModule(module)) {
      return [];
    }
    const remoteUrl = this.buildRemoteUrl(module, credentials);
    return GitManager.listRemoteVersionTags(remoteUrl);
  }

  /**
   * Imports module from local file path.
   * @param source Path to import from.
   * @param destination is this really needed???
   * @param skipValidation Skip prefix validation (used during updates)
   * @returns Module prefix of the imported module.
   */
  public async importFileModule(
    source: string,
    destination?: string,
    skipValidation = false,
  ) {
    if (!Validate.validateFolder(source)) {
      throw new Error(
        `Input validation error: folder name is invalid '${source}'`,
      );
    }
    if (!pathExists(source)) {
      throw new Error(
        `Input validation error: cannot find project '${source}'`,
      );
    }
    if (destination && !pathExists(destination)) {
      throw new Error(
        `Input validation error: destination does not exist '${destination}'`,
      );
    }
    const sourceProject = new Project(source);
    await sourceProject.populateCaches();
    const modulePrefix = sourceProject.projectPrefix;
    const destinationPath = join(
      this.project.paths.modulesFolder,
      modulePrefix,
    );
    const sourcePath = sourceProject.paths.resourcesFolder;

    this.validatePrefix(modulePrefix, skipValidation);

    // Copy files.
    await this.addFileContents(sourcePath, destinationPath);
    return modulePrefix;
  }

  /**
   * Imports module from gitUrl.
   * @param source Git URL to import from.
   * @param options Modules setting options.
   * @param credentials Credentials for private repositories.
   * @param skipValidation Skip prefix validation (used during updates)
   * @param ref Optional git tag/branch to check out; defaults to the
   *        repository's default branch.
   * @returns module prefix as defined in its CardsConfig.json
   */
  public async importGitModule(
    source: string,
    options?: ModuleSettingOptions,
    credentials?: Credentials,
    skipValidation = false,
    ref?: string,
  ) {
    const clonedName = await this.clone(
      {
        name: this.repositoryName(source),
        location: source,
        ...options,
      },
      undefined,
      credentials,
      ref,
    );
    const clonePath = join(this.tempModulesDir, clonedName);
    const modulePrefix = (await this.configuration(clonePath)).cardKeyPrefix;
    this.validatePrefix(modulePrefix, skipValidation);

    const sourcePath = new ProjectPaths(clonePath).resourcesFolder;
    const destinationPath = join(
      this.project.paths.modulesFolder,
      modulePrefix,
    );
    await this.addFileContents(sourcePath, destinationPath);
    return modulePrefix;
  }

  /**
   * Removed module from project.
   * If module is not used by any other modules, then will remove the module from disk as well.
   * Otherwise, only updates project configuration.
   * @param moduleName Name of the module to remove
   * @throws If module was not found.
   */
  public async removeModule(moduleName: string) {
    const projectModules = this.project.configuration.modules;
    const dependencies = await this.buildDependencyGraph(projectModules);
    const module = await this.project.module(moduleName);

    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }

    // Project module can always be removed from project configuration,
    // but modules under .cards/modules must be checked not to be used by
    // other modules.
    if (this.canBeRemoved(dependencies, moduleName)) {
      const orphans = this.orphanedModules(dependencies, moduleName);
      await deleteDir(module.path);
      for (const moduleToDelete of orphans) {
        const modulePath = join(
          this.project.paths.modulesFolder,
          moduleToDelete,
        );
        await deleteDir(modulePath);
      }
    }
    await this.project.removeModule(moduleName);
  }

  /**
   * Updates dependencies for a module without re-importing the module itself.
   * Used during module import to fetch dependencies after the main module is already imported.
   * @param module Module whose dependencies should be updated.
   * @param credentials Optional credentials for private repositories.
   * @param targetRefs Optional map of module name -> git ref (tag/branch) to
   *        use for cloning that module, bypassing constraint-based resolution.
   */
  public async updateDependencies(
    module: ModuleSetting,
    credentials?: Credentials,
    targetRefs?: Map<string, string>,
  ) {
    return this.update(module, credentials, new Set([module.name]), targetRefs);
  }

  /**
   * Updates a single module.
   * @param module Module to update.
   * @param credentials Optional credentials for private repositories.
   * @param skipModules Optional set of module names to skip during import.
   * @param targetRefs Optional map of module name -> git ref (tag/branch) to
   *        use for cloning that module, bypassing constraint-based resolution.
   *        The module's persisted version constraint is left untouched.
   */
  public async updateModule(
    module: ModuleSetting,
    credentials?: Credentials,
    skipModules?: Set<string>,
    targetRefs?: Map<string, string>,
  ) {
    return this.update(module, credentials, skipModules, targetRefs);
  }

  /**
   * Updates all imported modules.
   * @param credentials Optional credentials for private modules.
   */
  public async updateModules(credentials?: Credentials) {
    return this.update(undefined, credentials);
  }
}
