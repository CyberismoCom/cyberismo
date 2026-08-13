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
import { canonicalHubLocation } from './utils/hub-utils.js';
import { getChildLogger } from './utils/log-utils.js';
import { readCardsConfigSync } from './containers/project/cards-config.js';
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
  version?: string;
  modules: ModuleSetting[];
  hubs: HubSetting[];
  private logger = getChildLogger({ module: 'Project' });
  private settingPath: string;

  constructor(path: string) {
    this.name = '';
    this.settingPath = path;
    this.cardKeyPrefix = '';
    this.description = '';
    this.modules = [];
    this.hubs = [];
    this.readSettings();
  }

  // Sets configuration values from file.
  private readSettings() {
    const settings = readCardsConfigSync(this.settingPath);

    this.schemaVersion = settings.schemaVersion;
    this.cardKeyPrefix = settings.cardKeyPrefix;
    this.name = settings.name;
    this.category = settings.category;
    this.description = settings.description || '';
    this.version = settings.version;
    this.modules = settings.modules || [];
    this.hubs = settings.hubs || [];
  }

  // Return the configuration as object
  private toJSON(): ProjectSettings {
    return {
      schemaVersion: this.schemaVersion,
      cardKeyPrefix: this.cardKeyPrefix,
      name: this.name,
      category: this.category,
      description: this.description,
      version: this.version,
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
    const trimmedHub = canonicalHubLocation(hubName ?? '');
    if (!trimmedHub) {
      throw new Error(`Cannot add empty hub to the project`);
    }

    // Only new hubs are validated: locations already in the configuration are
    // canonicalized for matching, but never rejected, so that a legacy or
    // hand-edited entry can still be removed.
    let hubUrl: URL;
    try {
      hubUrl = new URL(trimmedHub);
    } catch (error) {
      throw new Error(
        `Invalid hub URL '${hubName}'. Please provide a valid HTTP or HTTPS URL.`,
        { cause: error },
      );
    }
    if (!['http:', 'https:'].includes(hubUrl.protocol)) {
      throw new Error(
        `Invalid URL protocol '${hubUrl.protocol}'. Only HTTP and HTTPS protocols are supported for hubs.`,
      );
    }
    if (!hubUrl.hostname) {
      throw new Error(
        `Invalid hub URL '${hubName}'. Hub URL must have a valid hostname.`,
      );
    }

    // Locations naming the same directory are the same hub, however written.
    const exists = this.hubs.find(
      (item) => canonicalHubLocation(item.location) === trimmedHub,
    );
    if (exists) {
      throw new Error(
        `Hub '${trimmedHub}' already exists as a hub for the project`,
      );
    }

    this.hubs.push({ location: trimmedHub });
    return this.save();
  }

  /**
   * Checks schema version compatibility.
   * @returns Compatibility state (true - compatible; false - not) and optional message related to it.
   */
  public checkSchemaVersion(): { isCompatible: boolean; message: string } {
    if (this.schemaVersion === undefined) {
      return {
        isCompatible: false,
        message:
          "Project's cardsConfig.json has no 'schemaVersion'. Set it manually to the schema version the project conforms to, then run 'cyberismo migrate'.",
      };
    }

    if (this.schemaVersion < SCHEMA_VERSION) {
      return {
        isCompatible: false,
        message: `Schema version mismatch: project is at schema version ${this.schemaVersion}, this tool requires ${SCHEMA_VERSION}. Run 'cyberismo migrate' to update the project.`,
      };
    }

    if (this.schemaVersion > SCHEMA_VERSION) {
      return {
        isCompatible: false,
        message: `Schema version mismatch: project is at schema version ${this.schemaVersion}, this tool supports up to ${SCHEMA_VERSION}. Upgrade cyberismo.`,
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
    // Match the same way adding does, so a hub added before locations were
    // stored canonically can still be named by either form.
    const target = canonicalHubLocation(hubName ?? '');
    const matches = (location: string) =>
      location === hubName || canonicalHubLocation(location) === target;
    const exists = this.hubs.find((item) => matches(item.location));
    if (!exists) {
      throw new Error(`Hub '${hubName}' not part of the project`);
    }
    this.hubs = this.hubs.filter((item) => !matches(item.location));
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
   * Sets the project version.
   * @param newVersion Semver version string (e.g. "1.0.0")
   */
  public async setVersion(newVersion: string) {
    this.version = newVersion;
    return this.save();
  }

  /**
   * Updates the version constraint of a module.
   * @param moduleName Name of the module to update
   * @param version Semver version or range constraint (e.g., "^1.0.0")
   */
  public async updateModuleVersion(moduleName: string, version: string) {
    const module = this.modules.find((item) => item.name === moduleName);
    if (!module) {
      throw new Error(`Module '${moduleName}' is not imported`);
    }
    module.version = version;
    return this.save();
  }

  /**
   * Inserts a module declaration, or updates an existing one in place.
   * Fields on the existing record are preserved unless overridden by the
   * incoming `module`.
   * @param module Module to insert or update.
   */
  public async upsertModule(module: ModuleSetting) {
    if (!module || !module.name) {
      throw new Error(`Module must have 'name' and 'url'`);
    }

    // Ensure that module file location is absolute.
    if (module.location && module.location.startsWith('file:')) {
      const filePath = module.location.substring(5, module.location.length);
      module.location = `file:${resolve(filePath)}`;
    }

    // A re-import after a module renamed its prefix arrives under the NEW
    // name while the OLD-name declaration still points at the same source;
    // left behind, it keeps the old installation referenced forever and
    // orphan cleanup can never remove it.
    if (module.location) {
      this.modules = this.modules.filter(
        (item) =>
          item.name === module.name || item.location !== module.location,
      );
    }

    const existing = this.modules.find((item) => item.name === module.name);
    if (existing) {
      existing.version = module.version;
      if (module.location) {
        existing.location = module.location;
      }
      if (module.private !== undefined) {
        existing.private = module.private;
      }
      if (module.credentials !== undefined) {
        existing.credentials = module.credentials;
      }
    } else {
      this.modules.push(module);
    }
    return this.save();
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

  /**
   * Sets the project category. An empty string clears the category.
   * @param newCategory New project category
   */
  public async setCategory(newCategory: string) {
    this.category = newCategory;
    return this.save();
  }

  /**
   * Sets the project description. An empty string clears the description.
   * @param newDescription New project description
   */
  public async setDescription(newDescription: string) {
    this.description = newDescription;
    return this.save();
  }
}
