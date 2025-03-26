/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { writeJsonFile as atomicWrite } from 'write-json-file';

import {
  ModuleSetting,
  ProjectSettings,
} from './interfaces/project-interfaces.js';
import { readJsonFileSync } from './utils/json.js';
import { Validate } from './commands/index.js';

/**
 * Represents Project's cardsConfig.json file.
 */
export class ProjectConfiguration implements ProjectSettings {
  private static instance: ProjectConfiguration;

  name: string;
  cardKeyPrefix: string;
  modules: ModuleSetting[];
  private settingPath: string;

  constructor(path: string) {
    this.name = '';
    this.settingPath = path;
    this.cardKeyPrefix = '';
    this.modules = [];
    this.readSettings();
  }

  // Persists configuration file to disk.
  public async save() {
    if (this.cardKeyPrefix === '') {
      throw new Error('wrong configuration');
    }
    try {
      await atomicWrite(this.settingPath, this.toJSON(), { indent: 4 });
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
      }
    }
  }

  // Sets configuration values from file.
  private readSettings() {
    let settings;
    try {
      settings = readJsonFileSync(this.settingPath) as ProjectConfiguration;
    } catch {
      throw new Error(
        `Invalid path '${this.settingPath}' to configuration file`,
      );
    }
    if (!settings) {
      throw new Error(
        `Invalid path '${this.settingPath}' to configuration file`,
      );
    }

    const valid =
      Object.prototype.hasOwnProperty.call(settings, 'cardKeyPrefix') &&
      Object.prototype.hasOwnProperty.call(settings, 'name');

    if (valid) {
      this.cardKeyPrefix = settings.cardKeyPrefix;
      this.name = settings.name;
      this.modules = settings.modules || [];
    } else {
      throw new Error(`Invalid configuration file '${this.settingPath}'`);
    }
  }

  // Return the configuration as object
  private toJSON(): ProjectSettings {
    return {
      cardKeyPrefix: this.cardKeyPrefix,
      name: this.name,
      modules: this.modules,
    };
  }

  /**
   * Adds new module to imported modules property.
   * @param module Module to add as dependency
   */
  public async addModule(module: ModuleSetting) {
    if (!module) {
      throw new Error(`Module must have 'name' and 'url'`);
    }
    const exists = this.modules.find((item) => item.name === module.name);
    if (exists) {
      throw new Error(`Module '${module.name}' already imported`);
    }
    this.modules.push(module);
    return this.save();
  }

  /**
   * Removes module from imported modules property.
   * @param moduleName Name of the module to remove.
   */
  public async removeModule(moduleName: string) {
    if (!moduleName) {
      throw new Error(`Name must be provided to remove module`);
    }
    const exists = this.modules.find((item) => item.name === moduleName);
    if (!exists) {
      throw new Error(`Module '${moduleName}' is not imported`);
    }
    this.modules = this.modules.filter((item) => item.name !== moduleName);
    return this.save();
  }

  /**
   * Changes project prefix.
   * @param newPrefix New prefix to use in the project
   */
  public async setCardPrefix(newPrefix: string) {
    const isValid = Validate.validatePrefix(newPrefix);
    if (isValid) {
      this.cardKeyPrefix = newPrefix;
      return this.save();
    }
    throw new Error(
      `Prefix '${newPrefix}' is not valid prefix. Prefix should be in lowercase and contain letters from a to z (max length 10).`,
    );
  }
}
