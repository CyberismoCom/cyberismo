/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { open, writeFile } from 'node:fs/promises';

// ismo
import { formatJson } from './utils/json.js';
import { projectSettings } from './interfaces/project-interfaces.js';
import { readJsonFileSync } from './utils/json.js';
import { Validate } from './validate.js';

/**
 * Represents Project's cardsconfig.json file.
 */
export class ProjectSettings implements projectSettings {
  private static instance: ProjectSettings;

  name: string;
  cardkeyPrefix: string;
  nextAvailableCardNumber: number;
  currentTemporalKeyValue: number;
  private settingPath: string;

  constructor(path: string) {
    this.name = '';
    this.settingPath = path;
    this.cardkeyPrefix = '';
    this.nextAvailableCardNumber = 0;
    this.currentTemporalKeyValue = 0;
    this.readSettings();
  }

  // Persists configuration file to disk.
  private async persistConfiguration() {
    if (this.cardkeyPrefix === '' || this.nextAvailableCardNumber < 1) {
      throw new Error('wrong configuration');
    }
    await open(this.settingPath, 'w').then(async (file) => {
      try {
        await writeFile(file, formatJson(this.toJSON()));
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
      settings = readJsonFileSync(this.settingPath);
    } catch (error) {
      throw new Error(
        `Invalid path '${this.settingPath}' to configuration file`,
      );
    }

    const valid =
      'cardkeyPrefix' in settings &&
      'nextAvailableCardNumber' in settings &&
      'name' in settings;

    if (valid) {
      this.cardkeyPrefix = settings.cardkeyPrefix;
      this.nextAvailableCardNumber = settings.nextAvailableCardNumber;
      this.name = settings.name;
      this.currentTemporalKeyValue = this.nextAvailableCardNumber;
    } else {
      throw new Error(
        `Invalid path '${this.settingPath}' to configuration file`,
      );
    }
  }

  // Return the configuration as object
  private toJSON(): projectSettings {
    return {
      cardkeyPrefix: this.cardkeyPrefix,
      name: this.name,
      nextAvailableCardNumber: this.nextAvailableCardNumber,
    };
  }

  /**
   * Persists the current configuration.
   */
  public async commit() {
    await this.persistConfiguration();
    this.currentTemporalKeyValue = this.nextAvailableCardNumber;
  }

  /**
   * Possibly creates (if no instance exists, or path is different) and returns an instance of ProjectSettings.
   * @returns instance of ProjectSettings.
   */
  public static getInstance(path: string): ProjectSettings {
    // If there is no instance, or if path is not the same as current instance's path; create a new one.
    if (
      !ProjectSettings.instance ||
      path !== ProjectSettings.instance.settingPath
    ) {
      ProjectSettings.instance = new ProjectSettings(path);
    }
    return ProjectSettings.instance;
  }

  /**
   * Returns next available card key (e.g. test_11).
   * @returns next available card-key
   */
  public newCardKey(): string {
    return `${this.cardkeyPrefix}_${this.nextAvailableCardNumber++}`;
  }

  /**
   * Rolls back the changes in settings until last commit() call.
   */
  public rollback() {
    this.nextAvailableCardNumber = this.currentTemporalKeyValue;
    this.currentTemporalKeyValue = this.nextAvailableCardNumber;
  }

  /**
   * Changes project prefix.
   * @param newPrefix New prefix to use in the project
   */
  public setCardPrefix(newPrefix: string) {
    const isValid = Validate.validatePrefix(newPrefix);
    if (isValid) {
      this.cardkeyPrefix = newPrefix;
      this.commit();
      return;
    }
    throw new Error(
      `Prefix '${newPrefix}' is not valid prefix. Prefix should be in lowercase and contain letters from a to z (max length 10).`,
    );
  }
}
