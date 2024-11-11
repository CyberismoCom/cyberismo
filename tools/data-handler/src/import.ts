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

import { copyDir } from './utils/file-utils.js';
import { Project } from './containers/project.js';
import { readCsvFile } from './utils/csv.js';
import { Validate } from './validate.js';
import { Create } from './create.js';

export class Import {
  constructor(
    private project: Project,
    private createCmd: Create,
  ) {}

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
      const templateObject =
        await this.project.createTemplateObjectByName(template);
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
      const cardType = await this.project.cardType(
        card?.metadata?.cardType || '',
      );

      if (!cardType) {
        throw new Error(`Card type not found for card ${cardKey}`);
      }

      if (description) {
        await this.project.updateCardContent(cardKey, description);
      }

      // todo: could update all of the metadata values with single call to updateMetadataKey()
      if (labels) {
        await this.project.updateCardMetadataKey(
          cardKey,
          'labels',
          labels.split(' '),
        );
      }

      await this.project.updateCardMetadataKey(cardKey, 'title', title);
      for (const [key, value] of Object.entries(customFields)) {
        if (cardType.customFields.find((field) => field.name === key)) {
          await this.project.updateCardMetadataKey(cardKey, key, value);
        }
      }
      // NOTE: this is for the cli
      console.log(`Successfully imported card ${title}`);
      importedCards.push(cardKey);
    }
    return importedCards;
  }

  /**
   * Import module to another project. This basically copies templates, workflows and card types to a new project.
   * Resources will be added to a new directory under '.cards/modules'. The name of the
   * folder will be module prefix.
   * @param source Path to module that will be imported
   * @param destination Path to project that will receive the imported module
   */
  public async importProject(source: string, destination: string) {
    const destinationProject = new Project(destination);
    const sourceProject = new Project(source);
    const modulePrefix = sourceProject.projectPrefix;
    const destinationPath = join(
      destinationProject.paths.modulesFolder,
      modulePrefix,
    );
    const sourcePath = sourceProject.paths.resourcesFolder;

    // Do not allow modules with same prefixes.
    const currentlyUsedPrefixes = await destinationProject.projectPrefixes();
    if (currentlyUsedPrefixes.includes(modulePrefix)) {
      throw new Error(
        `Imported project includes a prefix '${modulePrefix}' that is already used in the project. Cannot import from '${source}'.\nRename module prefix before importing using 'cards rename'.`,
      );
    }

    // Copy files.
    await copyDir(sourcePath, destinationPath);

    // Update the resources.
    await this.project.collectModuleResources();
  }
}
