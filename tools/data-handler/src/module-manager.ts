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
import type {
  Credentials,
  ModuleSetting,
  ModuleSettingOptions,
} from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';
import type { ProjectConfiguration } from './project-settings.js';
import { ProjectPaths } from './containers/project/project-paths.js';
import { readJsonFile } from './utils/json.js';
import { Validate } from './commands/index.js';

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
  private tempModulesDir: string = '';
  private defaultBranchCache: Map<string, string> = new Map();

  constructor(private project: Project) {
    this.tempModulesDir = join(this.project.paths.tempFolder, 'modules');
  }

  // Copies module files into project directories.
  private async addFileContents(sourcePath: string, destinationPath: string) {
    // Copy files.
    await copyDir(sourcePath, destinationPath);

    // Update the resources.
    await this.project.collectModuleResources();
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

  // Handles cloning of a repository.
  private async clone(
    module: ModuleSetting,
    verbose: boolean = true,
    credentials?: Credentials,
  ): Promise<string> {
    if (!module.name || module.name === '') {
      module.name = this.repositoryName(module.location);
    }

    const destinationPath = join(this.tempModulesDir, module.name);

    let remote = module.location;
    if (module.private) {
      if (
        credentials &&
        credentials?.username &&
        credentials?.token &&
        module.location.startsWith(HTTPS_PROTOCOL)
      ) {
        if (verbose) {
          console.log(
            `... Using HTTPS with credentials '${credentials?.username}' for cloning '${module.name}'`,
          );
        }
        try {
          const repoUrl = new URL(module.location);
          const user = credentials?.username;
          const pass = credentials?.token;
          const host = repoUrl.host;
          const path = repoUrl.pathname;
          remote = `https://${user}:${pass}@${host}${path}`;
        } catch {
          throw new Error(`Invalid repository URL: ${module.location}`);
        }
      } else if (module.location.startsWith('git@')) {
        if (verbose) {
          console.log(`... Using SSH for cloning '${module.name}'`);
        }
      }
    } else {
      if (verbose) {
        console.log(
          `... Using HTTPS without credentials for cloning '${module.name}'`,
        );
      }
    }

    try {
      await mkdir(this.tempModulesDir, { recursive: true });
      const cloneOptions = await this.setCloneOptions(module);
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

  // Gets the default branch for a repository from remote or cache
  private async defaultBranch(module: ModuleSetting): Promise<string> {
    if (this.defaultBranchCache.has(module.location)) {
      return this.defaultBranchCache.get(module.location)!;
    }
    // Set the default branch if branch was not specified
    if (!module.branch) {
      const destinationPath = join(this.tempModulesDir, module.name);
      // Only return path after cloning
      if (pathExists(destinationPath)) {
        const git: SimpleGit = simpleGit({
          timeout: {
            block: this.gitTimeout(),
          },
        });
        const options = ['--abbrev-ref', 'HEAD'];
        const defaultBranch = await git.cwd(destinationPath).revparse(options);
        this.defaultBranchCache.set(module.location, defaultBranch);
        return defaultBranch;
      }
    }
    // The actual default branch will be updated later (after cloning).
    return '';
  }

  // Fetches direct dependencies of a module.
  private async dependencies(moduleName: string): Promise<Set<string>> {
    const allModules = await this.project.modules();
    if (!allModules) return new Set();
    const module = allModules.find((m) => m.name === moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }
    const modulePath = join(module.path, module.name, 'cardsConfig.json');
    const moduleConfiguration = (await readJsonFile(
      modulePath,
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
    let moduleRoot = '';
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
  }

  // Updates one module that is received from Git.
  private async handleGitModule(module: ModuleSetting) {
    await this.clone(module);
    const tempLocation = join(this.tempModulesDir, module.name);
    await this.remove(module);
    await this.importFromFolder(tempLocation, module.name);
  }

  // Updates one module.
  private async handleModule(module: ModuleSetting) {
    return this.isGitModule(module)
      ? this.handleGitModule(module)
      : this.handleFileModule(module);
  }

  // Imports from a given folder. Is used both for .temp/<module name> and file locations.
  private async importFromFolder(path: string, name: string) {
    await this.importFileModule(path);
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
      throw new Error(`Failed to prepare temporary directory: ${error}`);
    }
  }

  // Handles removing an imported module.
  private async remove(module: ModuleSetting) {
    try {
      await this.removeModuleFiles(module.name);
      console.log(`... Removed imported module '${module.name}'`);
    } catch (error) {
      if (error instanceof Error)
        console.error(
          `... New imported module '${module.name}', skipping remove`,
        );
    }
  }

  // Checks for duplicate ModuleSetting entries and throws an error if modules
  // with the same name have different branches or locations.
  // Treats undefined branch, empty string branch, and default branch as equivalent.
  // Returns an array with duplicate entries removed
  private async removeDuplicates(
    modules: ModuleSetting[],
  ): Promise<ModuleSetting[]> {
    const moduleMap = new Map<string, ModuleSetting>();

    // Normalize branch names by checking against the default branch for each module

    const normalizeBranch = async (module: ModuleSetting) => {
      return module.branch ? module.branch! : await this.defaultBranch(module);
    };

    for (const module of modules) {
      const existingModule = moduleMap.get(module.name);
      if (existingModule) {
        if (
          (existingModule.private && !module.private) ||
          (!existingModule.private && module.private)
        ) {
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
        const existingBranch = await normalizeBranch(existingModule);
        const newBranch = await normalizeBranch(module);

        if (existingBranch !== newBranch) {
          throw new Error(
            `Module conflict: '${module.name}' has different branches:\n` +
              `  - ${existingModule.branch || 'undefined'}\n` +
              `  - ${module.branch || 'undefined'}`,
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

  // Sets cloning options with support for default branch.
  private async setCloneOptions(module: ModuleSetting): Promise<string[]> {
    const cloneOptions = ['--depth', '1'];
    const defaultBranch = await this.defaultBranch(module);
    // Only specify branch if it's different from the default branch
    if (
      module.branch &&
      module.branch !== '' &&
      module.branch !== defaultBranch
    ) {
      cloneOptions.push('--branch', module.branch);
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
  private async update(module?: ModuleSetting, credentials?: Credentials) {
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

    let modules = module ? [module] : this.project.configuration.modules;
    if (modules.length === 0) {
      throw new Error(`No modules in the project!`);
    }
    modules = modules.filter((module) => this.isGitModule(module));

    const dotInterval = start();

    let uniqueModules: ModuleSetting[] = [];
    try {
      await this.collectModulePrefixes(modules, credentials);
      uniqueModules = await this.removeDuplicates(this.modules);
    } finally {
      finished(
        dotInterval,
        uniqueModules.map((item) => item.name),
      );

      // Update modules parallel.
      const promises: Promise<void>[] = [];
      uniqueModules.forEach((module) =>
        promises.push(this.handleModule(module)),
      );
      await Promise.all(promises);
      await deleteDir(this.tempModulesDir);
      await this.project.collectModuleResources();
    }
  }

  // Checks that module prefix is not in use in the project
  private async validatePrefix(modulePrefix: string) {
    // Do not allow modules with same prefixes.
    const currentlyUsedPrefixes = await this.project.projectPrefixes();
    if (currentlyUsedPrefixes.includes(modulePrefix)) {
      throw new Error(
        `Imported project has a prefix '${modulePrefix}' that is already used in the project. Cannot import from module.`,
      );
    }
  }

  /**
   * Imports module from local file path.
   * @param source Path to import from.
   * @param destination is this really needed???
   */
  public async importFileModule(source: string, destination?: string) {
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

    await this.validatePrefix(modulePrefix);

    // Copy files.
    await this.addFileContents(sourcePath, destinationPath);
    return modulePrefix;
  }

  /**
   * Imports module from gitUrl.
   * @param source Git URL to import from.
   * @param options Modules setting options.
   * @param credentials Credentials for private repositories.
   * @returns module prefix as defined in its CardsConfig.json
   */
  public async importGitModule(
    source: string,
    options?: ModuleSettingOptions,
    credentials?: Credentials,
  ) {
    const clonedName = await this.clone(
      {
        name: this.repositoryName(source),
        location: source,
        ...options,
      },
      undefined,
      credentials,
    );
    const clonePath = join(this.tempModulesDir, clonedName);
    const modulePrefix = (await this.configuration(clonePath)).cardKeyPrefix;
    await this.validatePrefix(modulePrefix);

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
   * Imports module from a local file path or a git URL.
   * @param module Module to update. If not provided, updates all modules.
   * @param credentials Optional credentials for private repositories.
   * @returns Module prefix as defined in its CardsConfig.json
   */
  public async updateModule(module: ModuleSetting, credentials?: Credentials) {
    return this.update(module, credentials);
  }

  /**
   * Updates all imported modules.
   * @param credentials Optional credentials for private modules.
   */
  public async updateModules(credentials?: Credentials) {
    return this.update(undefined, credentials);
  }
}
