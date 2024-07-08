// node
import { join } from 'node:path';
import { readdir, writeFile } from 'node:fs/promises';

// ismo
import { copyDir } from './utils/file-utils.js';
import { formatJson, readJsonFile } from './utils/json.js';
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

    const isValid = await Validate.getInstance().validateJson(
      csv,
      'csv-schema',
    );
    if (isValid.length !== 0) {
      throw new Error(isValid);
    }

    const project = new Project(path);

    const importedCards = [];

    for (const row of csv) {
      const { summary, template, description, labels, ...customFields } = row;
      const templateObject = await project.createTemplateObjectByName(template);
      if (!templateObject) {
        throw new Error(`Template '${template}' not found`);
      }

      const templateCards = await templateObject.cards();
      if (templateCards.length !== 1) {
        console.warn(
          `Template '${template}' for card '${summary}' does not have exactly one card. Skipping row.`,
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

      await project.updateCardMetadata(cardKey, 'summary', summary);
      for (const [key, value] of Object.entries(customFields)) {
        // make sure card contains the customField
        if (cardType.customFields?.find((field) => field.name === key)) {
          await project.updateCardMetadata(cardKey, key, value);
        }
      }
      console.log(`Successfully imported card ${summary}`);
      importedCards.push(cardKey);
    }
    return importedCards;
  }

  /**
   * Import module to another project. This basically copies templates, workflows and cardtypes to a new project.
   * @param source Path to module that will be imported
   * @param destination Path to project that will receive the imported module
   * @param moduleName Name for the imported projected in 'destination'.
   */
  async importProject(source: string, destination: string, moduleName: string) {
    const destinationProject = new Project(destination);
    const sourceProject = new Project(source);
    const destinationPath = join(destinationProject.modulesFolder, moduleName);
    const sourcePath = sourceProject.resourcesFolder;

    // Do not allow modules with same names.
    if ((await destinationProject.moduleNames()).includes(moduleName)) {
      throw new Error(
        `Project already has a module with name '${moduleName}'. Import with another name.`,
      );
    }

    // Do not allow modules with same prefixes.
    const sourcePrefix = sourceProject.configuration.cardkeyPrefix;
    const currentlyUsedPrefixes = await destinationProject.projectPrefixes();
    if (currentlyUsedPrefixes.includes(sourcePrefix)) {
      throw new Error(
        `Imported project includes a prefix '${sourcePrefix}' that is already used in the project. Cannot import from '${source}'.\nRename module prefix before importing using 'cards rename'.`,
      );
    }

    // Copy files.
    await copyDir(sourcePath, destinationPath);

    //
    // Once module has been imported, all of the resources need to be updated to match with the name given for the module.
    //

    // Update imported template cards.
    const templates = (
      await readdir(join(destinationPath, 'templates'))
    ).filter((item) => item !== '.schema');
    for (const template of templates) {
      const files = (
        await readdir(join(destinationPath, 'templates', template), {
          withFileTypes: true,
          recursive: true,
        })
      ).filter((item) => item.name === Project.cardMetadataFile);
      for (const file of files) {
        const content = await readJsonFile(join(file.path, file.name));
        content.cardtype = `${moduleName}/${content.cardtype}`;
        writeFile(join(file.path, file.name), formatJson(content));
      }
    }

    // Update imported cardtypes.
    const cardtypes = (
      await readdir(join(destinationPath, 'cardtypes'), { withFileTypes: true })
    ).filter((item) => item.name !== '.schema');
    for (const file of cardtypes) {
      const content = await readJsonFile(join(file.path, file.name));
      content.name = `${moduleName}/${content.name}`;
      content.workflow = `${moduleName}/${content.workflow}`;
      writeFile(join(file.path, file.name), formatJson(content));
    }

    // Update imported workflows.
    const workflows = (
      await readdir(join(destinationPath, 'workflows'), { withFileTypes: true })
    ).filter((item) => item.name !== '.schema');
    for (const file of workflows) {
      const content = await readJsonFile(join(file.path, file.name));
      content.name = `${moduleName}/${content.name}`;
      writeFile(join(file.path, file.name), formatJson(content));
    }
  }
}
