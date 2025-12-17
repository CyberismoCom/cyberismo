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
import { writeFileSync } from 'node:fs';

import { resolve } from 'node:path';
import { URL } from 'node:url';

import type {
  HubSetting,
  ModuleSetting,
  ProjectSettings,
} from './interfaces/project-interfaces.js';
import { formatJson } from './utils/json.js';
import { getChildLogger } from './utils/log-utils.js';
import { readJsonFileSync } from './utils/json.js';
import { Validate } from './commands/validate.js';
import { SCHEMA_VERSION } from '@cyberismo/assets';

/**
 * Represents Project's cardsConfig.json file.
 */
export class ProjectConfiguration implements ProjectSettings {
  schemaVersion?: number;
  name: string;
  cardKeyPrefix: string;
  category?: string;
  description: string;
  modules: ModuleSetting[];
  hubs: HubSetting[];
  private logger = getChildLogger({ module: 'Project' });
  private settingPath: string;
  private autoSave: boolean = false;

  constructor(path: string, autoSave: boolean = true) {
    this.name = '';
    this.settingPath = path;
    this.cardKeyPrefix = '';
    this.description = '';
    this.modules = [];
    this.hubs = [];
    this.autoSave = autoSave;
    this.readSettings();
    this.ensureSchemaVersionAndSave();
  }

  // Ensures that schemaVersion is set in the project configuration.
  // If missing, sets it to the current SCHEMA_VERSION and marks for auto-save.
  private ensureSchemaVersionAndSave() {
    if (this.schemaVersion === undefined) {
      this.schemaVersion = SCHEMA_VERSION;
      // Auto-saves the configuration, if schema version was updated.
      if (this.autoSave) {
        this.saveSync();
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
      this.schemaVersion = settings.schemaVersion;
      this.cardKeyPrefix = settings.cardKeyPrefix;
      this.name = settings.name;
      this.category = settings.category;
      this.description = settings.description || '';
      this.modules = settings.modules || [];
      this.hubs = settings.hubs || [];
    } else {
      throw new Error(`Invalid configuration file '${this.settingPath}'`);
    }
  }

  // Synchronously persists configuration file to disk.
  private saveSync() {
    if (this.cardKeyPrefix === '') {
      throw new Error('wrong configuration');
    }
    try {
      writeFileSync(this.settingPath, formatJson(this.toJSON()), 'utf-8');
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error({ error }, 'Cannot write project configuration');
      }
    }
  }

  // Return the configuration as object
  private toJSON(): ProjectSettings {
    return {
      schemaVersion: this.schemaVersion,
      cardKeyPrefix: this.cardKeyPrefix,
      name: this.name,
      category: this.category,
      description: this.description,
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
   * Checks schema version compatibility.
   * @returns Compatibility state (true - compatible; false - not) and optional message related to it.
   */
  public checkSchemaVersion(): { isCompatible: boolean; message: string } {
    if (this.schemaVersion === undefined) {
      return {
        isCompatible: true,
        message: '',
      };
    }

    if (this.schemaVersion < SCHEMA_VERSION) {
      return {
        isCompatible: false,
        message: `Schema version mismatch: Project schema version (${this.schemaVersion}) is older than the application schema version (${SCHEMA_VERSION}). A migration is needed.`,
      };
    }

    if (this.schemaVersion > SCHEMA_VERSION) {
      return {
        isCompatible: false,
        message: `Schema version mismatch: Project schema version (${this.schemaVersion}) is newer than the application schema version (${SCHEMA_VERSION}). Please update the application.`,
      };
    }

    // Schema versions are equal
    return {
      isCompatible: true,
      message: '',
    };
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

  // Persists configuration file to disk.
  public async save() {
    if (this.cardKeyPrefix === '') {
      throw new Error('wrong configuration');
    }
    try {
      await atomicWrite(this.settingPath, this.toJSON(), { indent: 4 });
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error({ error }, 'Could not write project configuration');
      }
    }
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

  /**
   * Changes project name.
   * @param newName New project name
   */
  public async setProjectName(newName: string) {
    const isValid = Validate.isValidProjectName(newName);
    if (isValid) {
      this.name = newName;
      return this.save();
    }
    throw new Error(`Project name '${newName}' is not valid.`);
  }
}
