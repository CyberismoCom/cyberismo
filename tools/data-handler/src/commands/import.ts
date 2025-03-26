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

import { CardType } from '../interfaces/resource-interfaces.js';
import { Create, Validate } from './index.js';
import { ModuleManager } from '../module-manager.js';
import { Project } from '../containers/project.js';
import { readCsvFile } from '../utils/csv.js';
import { resourceName } from '../utils/resource-utils.js';
import { TemplateResource } from '../resources/template-resource.js';

export class Import {
  private moduleManager: ModuleManager;
  constructor(
    private project: Project,
    private createCmd: Create,
  ) {
    this.moduleManager = new ModuleManager(this.project, this);
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

      const templateCards = await templateObject.cards();
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
      const cardKey = cards[0];
      const card = await this.project.findSpecificCard(cardKey, {
        metadata: true,
      });
      const cardType = await this.project.resource<CardType>(
        card?.metadata?.cardType || '',
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
   * @param branch Git branch for module from Git. Optional.
   */
  public async importModule(
    source: string,
    destination?: string,
    branch?: string,
  ) {
    const gitModule = source.startsWith('https');
    const modulePrefix = gitModule
      ? await this.moduleManager.importGitModule(source)
      : await this.moduleManager.importFileModule(source, destination);

    if (!modulePrefix) {
      throw new Error(
        `Cannot find prefix for imported module '${source}'. Import cancelled.`,
      );
    }

    // Add module as a dependency.
    return this.project.importModule({
      name: modulePrefix,
      branch: branch,
      location: gitModule ? source : `file:${source}`,
    });
  }

  /**
   * Updates all imported modules.
   */
  public async updateAllModules() {
    return this.moduleManager.update();
  }

  /**
   * Updates 'moduleName' module from its source.
   * Modules using gitUrl, are first copied to .temp
   * @param moduleName module name (prefix) to update
   */
  public async updateExistingModule(moduleName: string) {
    await this.moduleManager.importFileModule(moduleName);
  }
}
