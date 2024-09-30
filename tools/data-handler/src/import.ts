/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join } from 'node:path';

// ismo
import { copyDir } from './utils/file-utils.js';
import { Project } from './containers/project.js';

import { readCsvFile } from './utils/csv.js';
import { Validate } from './validate.js';
import { Create } from './create.js';
import { Calculate } from './calculate.js';

export class Import {
  createCmd: Create;
  constructor() {
    this.createCmd = new Create(new Calculate());
  }

  /**
   * Imports cards based on a csv file
   * @param path path to the project
   * @param csvFilePath path to the csv file
   * @param parentCardKey the cards in the csv file will be created under this card
   * @returns card keys of the imported cards
   */
  async importCsv(
    path: string,
    csvFilePath: string,
    parentCardKey?: string,
  ): Promise<string[]> {
    const csv = await readCsvFile(csvFilePath);

    const isValid = Validate.getInstance().validateJson(csv, 'csv-schema');
    if (isValid.length !== 0) {
      throw new Error(isValid);
    }

    const project = new Project(path);

    const importedCards = [];

    for (const row of csv) {
      const { title, template, description, labels, ...customFields } = row;
      const templateObject = await project.createTemplateObjectByName(template);
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
      const cards = await this.createCmd.createCard(
        path,
        template,
        parentCardKey,
      );

      if (cards.length !== 1) {
        throw new Error('Card not created');
      }
      const cardKey = cards[0];
      const card = await project.findSpecificCard(cardKey, {
        metadata: true,
      });
      const cardType = await project.cardType(card?.metadata?.cardtype);

      if (!cardType) {
        throw new Error(`Cardtype not found for card ${cardKey}`);
      }

      if (description) {
        await project.updateCardContent(cardKey, description);
      }

      if (labels) {
        await project.updateCardMetadata(cardKey, 'labels', labels.split(' '));
      }

      await project.updateCardMetadata(cardKey, 'title', title);
      for (const [key, value] of Object.entries(customFields)) {
        if (cardType.customFields?.find((field) => field.name === key)) {
          await project.updateCardMetadata(cardKey, key, value);
        }
      }
      console.log(`Successfully imported card ${title}`);
      importedCards.push(cardKey);
    }
    return importedCards;
  }

  /**
   * Import module to another project. This basically copies templates, workflows and cardtypes to a new project.
   * Resources will be added to a new directory under '.cards/modules'. The name of the
   * folder will be module prefix.
   * @param source Path to module that will be imported
   * @param path Path to project that will receive the imported module
   */
  async importProject(source: string, path: string) {
    const destinationProject = new Project(path);
    const sourceProject = new Project(source);
    const modulePrefix = sourceProject.projectPrefix;
    const destinationPath = join(
      destinationProject.modulesFolder,
      modulePrefix,
    );
    const sourcePath = sourceProject.resourcesFolder;

    // Do not allow modules with same prefixes.
    const currentlyUsedPrefixes = await destinationProject.projectPrefixes();
    if (currentlyUsedPrefixes.includes(modulePrefix)) {
      throw new Error(
        `Imported project includes a prefix '${modulePrefix}' that is already used in the project. Cannot import from '${source}'.\nRename module prefix before importing using 'cards rename'.`,
      );
    }

    // Copy files.
    await copyDir(sourcePath, destinationPath);
  }
}
