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

import { resolve } from 'node:path';
import { URL } from 'node:url';

import type {
  HubSetting,
  ModuleSetting,
  ProjectSettings,
} from './interfaces/project-interfaces.js';
import { readJsonFileSync } from './utils/json.js';
import { Validate } from './commands/validate.js';

/**
 * Represents Project's cardsConfig.json file.
 */
export class ProjectConfiguration implements ProjectSettings {
  private static instance: ProjectConfiguration;

  name: string;
  cardKeyPrefix: string;
  modules: ModuleSetting[];
  hubs: HubSetting[];
  private settingPath: string;

  constructor(path: string) {
    this.name = '';
    this.settingPath = path;
    this.cardKeyPrefix = '';
    this.modules = [];
    this.hubs = [];
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
    const settings = readJsonFileSync(this.settingPath);
    if (!settings) {
      throw new Error(`File at '${this.settingPath}' is not a valid JSON file`);
    }

    const valid =
      Object.prototype.hasOwnProperty.call(settings, 'cardKeyPrefix') &&
      Object.prototype.hasOwnProperty.call(settings, 'name');

    if (valid) {
      this.cardKeyPrefix = settings.cardKeyPrefix;
      this.name = settings.name;
      this.modules = settings.modules || [];
      this.hubs = settings.hubs || [];
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
      hubs: this.hubs,
    };
  }

  /**
   * Adds a new hub.
   * @param hubName URL of the hub to add
   * @throws if hub is already in the project or URL is invalid
   */
  public async addHub(hubName: string) {
    const trimmedHub = hubName?.trim();
    if (!trimmedHub) {
      throw new Error(`Cannot add empty hub to the project`);
    }

    const exists = this.hubs.find((item) => item.location === trimmedHub);
    if (exists) {
      throw new Error(
        `Hub '${trimmedHub}' already exists as a hub for the project`,
      );
    }

    try {
      const hubUrl = new URL(trimmedHub);
      if (!['http:', 'https:'].includes(hubUrl.protocol)) {
        throw new Error(
          `Invalid URL protocol '${hubUrl.protocol}'. Only HTTP and HTTPS protocols are supported for hubs.`,
        );
      }
      if (!hubUrl.hostname) {
        throw new Error('Hub URL must have a valid hostname.');
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          `Invalid hub URL '${trimmedHub}'. Please provide a valid HTTP or HTTPS URL.`,
        );
      }
      throw error;
    }

    this.hubs.push({ location: trimmedHub });
    return this.save();
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
    // Ensure that module file location is absolute
    if (module.location && module.location.startsWith('file:')) {
      const filePath = module.location.substring(5, module.location.length);
      module.location = `file:${resolve(filePath)}`;
    }
    this.modules.push(module);
    return this.save();
  }

  /**
   * Removes a hub.
   * @param hubName Name of the hub to remove.
   * @throws if hub is not part of the project
   */
  public async removeHub(hubName: string) {
    const exists = this.hubs.find((item) => item.location === hubName);
    if (!exists) {
      throw new Error(`Hub '${hubName}' not part of the project`);
    }
    this.hubs = this.hubs.filter((item) => item.location !== hubName);
    return this.save();
  }

  /**
   * Removes module from imported modules property.
   * @param moduleName Name of the module to remove.
   * @throws If Module name is empty, or not imported to the project.
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
