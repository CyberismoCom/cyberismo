/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { open } from 'node:fs/promises';

import { ProjectSettings } from './interfaces/project-interfaces.js';
import { readJsonFileSync, writeJsonFile } from './utils/json.js';
import { Validate } from './commands/index.js';

/**
 * Represents Project's cardsConfig.json file.
 */
export class ProjectConfiguration implements ProjectSettings {
  private static instance: ProjectConfiguration;

  name: string;
  cardKeyPrefix: string;
  private settingPath: string;

  constructor(path: string) {
    this.name = '';
    this.settingPath = path;
    this.cardKeyPrefix = '';
    this.readSettings();
  }

  // Persists configuration file to disk.
  public async save() {
    if (this.cardKeyPrefix === '') {
      throw new Error('wrong configuration');
    }
    await open(this.settingPath, 'w').then(async (file) => {
      try {
        await writeJsonFile(file, this.toJSON());
        file.close();
      } catch (error) {
        if (error instanceof Error) {
          console.error(error.message);
        }
      }
    });
  }

  // Sets configuration values from file.
  private readSettings() {
    let settings;
    try {
      settings = readJsonFileSync(this.settingPath) as ProjectSettings;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Invalid path '${this.settingPath}' to configuration file`,
        );
      }
    }
    if (!settings) {
      throw new Error(
        `Invalid path '${this.settingPath}' to configuration file`,
      );
    }

    const valid = 'cardKeyPrefix' in settings && 'name' in settings;

    if (valid) {
      this.cardKeyPrefix = settings.cardKeyPrefix;
      this.name = settings.name;
    } else {
      throw new Error(`Invalid configuration file '${this.settingPath}'`);
    }
  }

  // Return the configuration as object
  private toJSON(): ProjectSettings {
    return {
      cardKeyPrefix: this.cardKeyPrefix,
      name: this.name,
    };
  }

  /**
   * Possibly creates (if no instance exists, or path is different) and returns an instance of ProjectSettings.
   * @returns instance of ProjectSettings.
   */
  public static getInstance(path: string): ProjectConfiguration {
    // If there is no instance, or if path is not the same as current instance's path; create a new one.
    if (
      !ProjectConfiguration.instance ||
      path !== ProjectConfiguration.instance.settingPath
    ) {
      ProjectConfiguration.instance = new ProjectConfiguration(path);
    }
    return ProjectConfiguration.instance;
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
