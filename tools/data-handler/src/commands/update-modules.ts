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

import { errorFunction } from '../utils/log-utils.js';
import { Import, Remove } from './index.js';
import { pathExists } from '../utils/file-utils.js';
import { Project } from '../containers/project.js';
import { ModuleSetting } from '../interfaces/project-interfaces.js';

/**
 * Class that updates module / modules for a project.
 */
export class UpdateModules {
  private modules: ModuleSetting[] = [];
  private tempModulesDir: string = '';
  constructor(
    private project: Project,
    private importCmd: Import,
    private removeCmd: Remove,
  ) {
    this.tempModulesDir = join(this.project.paths.tempFolder, 'modules');
  }

  // Handles a branch of a repository.
  private async branch(module: ModuleSetting) {
    if (module.branch !== 'main') {
      await git.checkout({
        fs,
        dir: join(this.tempModulesDir, module.name),
        ref: module.branch,
      });
      console.error(`switched to '${module.branch}' branch`);
    }
  }

  // Handles cloning of a repository.
  private async clone(module: ModuleSetting) {
    const repoUrl = new URL(module.url);
    repoUrl.username = process.env.CYBERISMO_GIT_USER || '';
    repoUrl.password = process.env.CYBERISMO_GIT_TOKEN || '';
    await git.clone({
      fs,
      http,
      dir: join(this.tempModulesDir, module.name),
      url: repoUrl.toString(),
      depth: 1,
    });
    console.log(`cloned '${module.name}' to a temp folder`);
  }

  // Updates one module.
  private async handleModule(module: ModuleSetting) {
    await this.clone(module);
    await this.branch(module);
    await this.remove(module);
    await this.import(module);
  }

  // Handles importing a module.
  private async import(module: ModuleSetting) {
    await this.importCmd.importProject(
      join(this.tempModulesDir, module.name),
      this.project.paths.cardRootFolder,
    );
    console.log(`imported module '${module.name}'`);
  }

  // Prepares .temp/modules for cloning
  private async prepare() {
    if (!pathExists(this.tempModulesDir)) {
      await mkdir(this.tempModulesDir, { recursive: true });
    } else {
      for (const file of await readdir(this.tempModulesDir)) {
        await rm(join(this.tempModulesDir, file), {
          force: true,
          recursive: true,
        });
      }
    }
  }

  // Handles removing an imported module.
  private async remove(module: ModuleSetting) {
    try {
      await this.removeCmd.removeModule(module.name);
      console.log(`removed imported module '${module.name}'`);
    } catch (error) {
      if (error instanceof Error)
        console.error(
          `Module '${module.name}' was not imported before, skipping remove`,
        );
    }
  }

  // Sets modules property
  private setModules() {
    const modules = this.project.configuration.modules;
    if (!modules || modules.length === 0) {
      return;
    }
    this.modules = modules;
  }

  /**
   * Updates all imported modules.
   * todo: add tests for this API
   * todo: add tests for new public API removeModule
   * todo: add tests for new Cmd through CLI
   * todo: add documentation how to use env variables
   * todo: add means how to update Project configuration
   * todo: remove .temp after use?
   */
  public async update() {
    this.setModules();
    await this.prepare();

    if (this.modules.length === 0) {
      throw new Error(`No modules in the project!`);
    }

    this.modules.forEach(async (module) => {
      try {
        await this.handleModule(module);
      } catch (error) {
        console.error(
          `Could not update '${module.name}' : ${errorFunction(error)}`,
        );
      }
    });
  }
}
