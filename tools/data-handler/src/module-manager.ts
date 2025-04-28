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

import fs from 'node:fs';
import { join } from 'node:path';
import { mkdir, readdir, rm } from 'node:fs/promises';

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node/index.js';

import { copyDir, deleteDir, pathExists } from './utils/file-utils.js';
import { Import } from './commands/index.js';
import { ModuleSetting } from './interfaces/project-interfaces.js';
import { Project } from './containers/project.js';
import { ProjectConfiguration } from './project-settings.js';
import { ProjectPaths } from './containers/project/project-paths.js';
import { readJsonFile } from './utils/json.js';
import { Validate } from './commands/index.js';

const FILE_PROTOCOL = 'file:';
// todo: add support for git's default branch.
const MAIN_BRANCH = 'main';

/**
 * Class that handles module updates and imports.
 */
export class ModuleManager {
  private modules: ModuleSetting[] = [];
  private tempModulesDir: string = '';
  constructor(
    private project: Project,
    private importCmd: Import,
  ) {
    this.tempModulesDir = join(this.project.paths.tempFolder, 'modules');
  }

  // Copies module files into project directories.
  private async addFileContents(sourcePath: string, destinationPath: string) {
    // Copy files.
    await copyDir(sourcePath, destinationPath);

    // Update the resources.
    await this.project.collectModuleResources();
  }

  // Handles a branch of a repository.
  private async branch(module: ModuleSetting) {
    if (module.branch === MAIN_BRANCH || module.branch === '' || !module.branch)
      return;

    await git.checkout({
      fs,
      dir: join(this.tempModulesDir, module.name),
      ref: module.branch,
    });
    console.error(`... Switched to '${module.branch}' branch`);
  }

  // Handles cloning of a repository.
  private async clone(
    module: ModuleSetting,
    verbose: boolean = true,
  ): Promise<string> {
    if (!module.name || module.name === '') {
      module.name = this.repositoryName(module.location);
    }
    const repoUrl = new URL(module.location);
    repoUrl.username = process.env.CYBERISMO_GIT_USER ?? '';
    repoUrl.password = process.env.CYBERISMO_GIT_TOKEN ?? '';
    if (!repoUrl.username) {
      throw new Error(
        `No user defined. Cannot clone git repo. Set CYBERISMO_GIT_USER environment variable`,
      );
    }
    if (!repoUrl.password) {
      throw new Error(
        `No git token defined. Cannot clone git repo. Set CYBERISMO_GIT_TOKEN environment variable`,
      );
    }
    await git.clone({
      fs,
      http,
      dir: join(this.tempModulesDir, module.name),
      url: repoUrl.toString(),
      depth: 1,
    });
    if (verbose) {
      console.log(`... Cloned '${module.name}' to a temporary folder`);
    }
    return module.name;
  }

  // Collects all module prefixes from module hierarchy into 'this.modules'.
  // Note that collected result can contain duplicates.
  private async collectModulePrefixes(modules: ModuleSetting[]) {
    if (modules) {
      for (const module of modules) {
        await this.doCollectModulePrefix(module);
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

  // Collects one module's dependency prefixes to 'this.modules'.
  // Note that there can be duplicate entries.
  private async doCollectModulePrefix(module: ModuleSetting) {
    let moduleRoot = '';
    if (this.isFileModule(module)) {
      const urlStart = FILE_PROTOCOL.length;
      // Remove 'file:' from location
      moduleRoot = module.location.substring(urlStart, module.location.length);
    } else {
      await this.clone(module, false);
      moduleRoot = join(this.tempModulesDir, module.name);
    }

    this.modules.push(module);

    const configuration = await this.configuration(moduleRoot);
    await this.collectModulePrefixes(configuration.modules);
  }

  // Updates one module that is read from local file system.
  private async handleFileModule(module: ModuleSetting) {
    this.removeProtocolFromLocation(module);
    await this.remove(module);
    await this.importFromFolder(module);
  }

  // Updates one module that is received from Git.
  private async handleGitModule(module: ModuleSetting) {
    await this.clone(module);
    await this.branch(module);
    await this.remove(module);
    await this.importFromTemp(module);
  }

  // Updates one module.
  private async handleModule(module: ModuleSetting) {
    return this.isFileModule(module)
      ? this.handleFileModule(module)
      : this.handleGitModule(module);
  }

  // Handles importing a module from module settings 'location'
  private async importFromFolder(module: ModuleSetting) {
    await this.importCmd.updateExistingModule(module.location);
    console.log(`... Imported module '${module.name}' to the project`);
  }

  // Handles importing a module from '.temp' folder
  private async importFromTemp(module: ModuleSetting) {
    await this.importCmd.updateExistingModule(
      join(this.tempModulesDir, module.name),
    );
    console.log(`... Imported module '${module.name}' to the project`);
  }

  // Returns true if module is imported from file-system.
  private isFileModule(module: ModuleSetting): boolean {
    if (!module.location) return false;
    return module.location.startsWith('file:');
  }

  // Prepares '.temp/modules' for cloning
  private async prepare() {
    await mkdir(this.tempModulesDir, { recursive: true });
    for (const file of await readdir(this.tempModulesDir)) {
      await rm(join(this.tempModulesDir, file), {
        force: true,
        recursive: true,
      });
    }
  }

  // Returns whether to use git or file system for handling the module.
  private protocol(module: ModuleSetting) {
    return this.isFileModule(module) ? 'file' : 'git';
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

  // Remove module files.
  private async removeModuleFiles(moduleName: string) {
    const module = await this.project.module(moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' not found`);
    }
    await deleteDir(module.path);
  }

  // Updates module's 'location' not to have 'protocol:' in the beginning (only for "file:" needed).
  private removeProtocolFromLocation(module: ModuleSetting) {
    const protocol = this.protocol(module);
    module.location = module.location.substring(
      protocol.length + 1,
      module.location.length,
    );
  }

  // Checks for duplicate ModuleSetting entries and throws an error if modules
  // with the same name have different branches or locations.
  // Treats undefined branch, empty string branch, and "main" branch as equivalent.
  // Returns an array with duplicate entries removed
  private removeDuplicates(modules: ModuleSetting[]): ModuleSetting[] {
    const moduleMap = new Map<string, ModuleSetting>();

    // Assume that empty, or missing branch means 'main'
    const normalizeBranch = (branch: string | undefined): string => {
      if (!branch || branch === '' || branch === MAIN_BRANCH) {
        return MAIN_BRANCH;
      }
      return branch;
    };

    for (const module of modules) {
      const existingModule = moduleMap.get(module.name);
      if (existingModule) {
        if (existingModule.location !== module.location) {
          throw new Error(
            `Module conflict: '${module.name}' has different locations:\n` +
              `  - ${existingModule.location}\n` +
              `  - ${module.location}`,
          );
        }
        const existingBranch = normalizeBranch(existingModule.branch);
        const newBranch = normalizeBranch(module.branch);

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

  // Gets repository name from gitUrl
  private repositoryName(gitUrl: string): string {
    const last = gitUrl.lastIndexOf('/');
    const repoName = gitUrl.substring(last + 1, gitUrl.length - 4); //remove trailing ".git"
    return repoName;
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
   * @returns module prefix as defined in its CardsConfig.json
   */
  public async importGitModule(source: string) {
    const repoName = await this.clone({
      name: '',
      location: source,
    });
    await this.branch({ name: repoName, location: source });
    const clonePath = join(this.project.paths.tempFolder, 'modules', repoName);
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
   * Updates all imported modules.
   */
  public async update() {
    // Prints dots every half second so that user knows that something is ongoing
    function start() {
      console.log('... Collecting unique modules. This takes a moment.');
      return setInterval(() => process.stdout.write(`.`), 500);
    }

    // Stops the above, and shows results
    function finished(interval: NodeJS.Timeout, modules: string[]) {
      clearInterval(interval);
      console.log(`\n... Found modules: ${modules.join(', ')}`);
    }

    await this.prepare();

    const modules = this.project.configuration.modules;
    if (modules.length === 0) {
      throw new Error(`No modules in the project!`);
    }

    const dotInterval = start();

    // Collect prefixes from project's dependency modules.
    await this.collectModulePrefixes(modules);

    let uniqueModules: ModuleSetting[] = [];
    try {
      uniqueModules = this.removeDuplicates(this.modules);
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
}
