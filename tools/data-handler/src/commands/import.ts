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

import type { CardType } from '../interfaces/resource-interfaces.js';
import { type Create, Validate } from './index.js';
import { ModuleManager } from '../module-manager.js';
import type {
  Credentials,
  ModuleSettingOptions,
} from '../interfaces/project-interfaces.js';
import type { Project } from '../containers/project.js';
import { readCsvFile } from '../utils/csv.js';
import { resourceName } from '../utils/resource-utils.js';
import { TemplateResource } from '../resources/template-resource.js';

export class Import {
  private moduleManager: ModuleManager;
  constructor(
    private project: Project,
    private createCmd: Create,
  ) {
    this.moduleManager = new ModuleManager(this.project);
  }

  /**
   * Imports cards based on a csv file
   * @param csvFilePath path to the csv file
   * @param parentCardKey the cards in the csv file will be created under this card
   * @returns card keys of the imported cards
   */
  public async importCsv(
    csvFilePath: string,
    parentCardKey?: string,
  ): Promise<string[]> {
    const csv = await readCsvFile(csvFilePath);

    const isValid = Validate.getInstance().validateJson(csv, 'csvSchema');
    if (isValid.length !== 0) {
      throw new Error(isValid);
    }

    const importedCards = [];

    for (const row of csv) {
      const { title, template, description, labels, ...customFields } = row;
      const templateResource = new TemplateResource(
        this.project,
        resourceName(template),
      );
      const templateObject = templateResource.templateObject();
      if (!templateObject) {
        throw new Error(`Template '${template}' not found`);
      }

      const templateCards = templateObject.cards();
      if (templateCards.length !== 1) {
        console.warn(
          `Template '${template}' for card '${title}' does not have exactly one card. Skipping row.`,
        );
        continue;
      }

      // Create card
      const cards = await this.createCmd.createCard(template, parentCardKey);

      if (cards.length !== 1) {
        throw new Error('Card not created');
      }
      const cardKey = cards[0].key;
      const card = this.project.findCard(cardKey);
      const cardType = this.project.resource<CardType>(
        card.metadata?.cardType || '',
      );

      if (!cardType) {
        throw new Error(`Card type not found for card ${cardKey}`);
      }

      if (description) {
        await this.project.updateCardContent(cardKey, description);
      }

      if (labels) {
        for (const label of labels.split(' ')) {
          try {
            await this.createCmd.createLabel(cardKey, label);
          } catch (e) {
            console.error(
              `Failed to create label ${label}: ${e instanceof Error ? e.message : 'Unknown error'}`,
            );
          }
        }
      }

      await this.project.updateCardMetadataKey(cardKey, 'title', title);
      for (const [key, value] of Object.entries(customFields)) {
        if (cardType.customFields.find((field) => field.name === key)) {
          await this.project.updateCardMetadataKey(cardKey, key, value);
        }
      }
      importedCards.push(cardKey);
    }
    return importedCards;
  }

  /**
   * Imports a module to a project. Copies resources to the project.
   * Resources will be added to a new directory under '.cards/modules'.
   * The name of the new folder will be module's prefix.
   *
   * Note that file references are relative, and thus URI must be
   * 'file:<relative path>', instead of 'file://<relative path>'.
   *
   * @param source Path to module that will be imported
   * @param destination Path to project that will receive the imported module
   * @param options Additional options for module import. Optional.
   *        branch: Git branch for module from Git.
   *        private: If true, uses credentials to clone the repository
   */
  public async importModule(
    source: string,
    destination?: string,
    options?: ModuleSettingOptions,
  ) {
    const beforeImportValidateErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );
    const gitModule = source.startsWith('https') || source.startsWith('git@');
    const modulePrefix = gitModule
      ? await this.moduleManager.importGitModule(source, options)
      : await this.moduleManager.importFileModule(source, destination);

    if (!modulePrefix) {
      throw new Error(
        `Cannot find prefix for imported module '${source}'. Import cancelled.`,
      );
    }

    const moduleSettings = {
      name: modulePrefix,
      branch: options ? options.branch : undefined,
      private: options ? options.private : undefined,
      location: gitModule ? source : `file:${source}`,
    };

    // Fetch module dependencies.
    await this.moduleManager.updateModule(moduleSettings, options?.credentials);

    // Add module as a dependency.
    await this.project.importModule(moduleSettings);

    // Validate the project after module has been imported
    const afterImportValidateErrors = await Validate.getInstance().validate(
      this.project.basePath,
      () => this.project,
    );
    if (afterImportValidateErrors.length > beforeImportValidateErrors.length) {
      console.error(
        `There are new validations errors after importing the module. Check the project`,
      );
    }
  }

  /**
   * Updates a specific imported module.
   * @param moduleName Name (prefix) of module to update.
   * @param credentials Optional credentials for a private module.
   * @throws if module is not part of the project
   */
  public async updateModule(moduleName: string, credentials?: Credentials) {
    const module = this.project.configuration.modules.find(
      (item) => item.name === moduleName,
    );
    if (!module) {
      throw new Error(`Module '${moduleName}' is not part of the project`);
    }
    return this.moduleManager.updateModule(module, credentials);
  }

  /**
   * Updates all imported modules.
   * @param credentials Optional credentials for private modules.
   */
  public async updateAllModules(credentials?: Credentials) {
    return this.moduleManager.updateModules(credentials);
  }
}
