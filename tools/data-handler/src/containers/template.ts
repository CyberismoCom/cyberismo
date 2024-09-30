/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { basename, join, resolve, sep } from 'node:path';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

// ismo
import {
  attachmentDetails,
  card,
  cardNameRegEx,
  fetchCardDetails,
  resource,
  template,
  templateMetadata,
} from '../interfaces/project-interfaces.js';
import { copyDir, pathExists, sepRegex } from '../utils/file-utils.js';
import { formatJson, readJsonFile } from '../utils/json.js';
import { Project } from './project.js';

// Base class
import { CardContainer } from './card-container.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  sortItems,
} from '../utils/lexorank.js';

// Simple mapping table for card instantiation
interface mappingValue {
  from: string;
  to: string;
}

// creates template instance based on a project path and name
export class Template extends CardContainer {
  private templatePath: string;
  private templateCardsPath: string;
  private project: Project;

  private static dotSchemaContent: string = formatJson({
    id: 'card-base-schema',
    version: 1,
  });

  constructor(path: string, template: resource, project?: Project) {
    // Templates might come from modules. Remove module name from template name.
    template.name = basename(template.name);
    super(path, template.name);

    // prevent constructing a new project object, if one is passed to this class.
    this.project = project ? project : new Project(this.basePath);
    // optimization - if template.path is set - use it
    this.templatePath =
      template.path && template.path.length > 0
        ? join(template.path, template.name)
        : this.setTemplatePath(this.containerName);
    this.templateCardsPath = join(this.templatePath, 'c');
  }

  // Creates card(s) as project cards from template.
  // optimize: first make temp file, them copy all template cards to it as-is.
  //           Then rename the folder based on mapped names.
  //           Make 'card' item changed to write them to json file.
  //           Finally copy from temp to real place.
  private async doCreateCards(
    cards: card[],
    parentCard?: card,
  ): Promise<card[]> {
    const templateIDMap: mappingValue[] = [];
    const tempDestination = join(this.project.cardrootFolder, 'temp');

    // First, create a mapping table.
    for (const card of cards) {
      templateIDMap.push({
        from: card.key,
        to: await this.project.newCardKey(),
      });
    }

    // find parent cards
    // here we want to insert the cards after the last card, but not after a card that has no rank
    // for clarity: These are the "root" template cards
    const parentCards = sortItems(
      cards.filter((c) => c.parent === this.containerName),
      (c) => c?.metadata?.rank || '',
    );

    // If parent card is not defined, then we are creating top-level cards.
    // also filter out cards that have no rank
    const futureSiblings = (
      parentCard
        ? parentCard.children || []
        : await this.project.showProjectCards()
    ).filter((c) => c.metadata?.rank !== undefined);

    let latestRank = sortItems(
      futureSiblings,
      (c) => c.metadata?.rank || '',
    ).pop()?.metadata?.rank;

    if (!latestRank) {
      latestRank = FIRST_RANK;
    }

    parentCards.forEach((card) => {
      const newRank = getRankAfter(latestRank as string);
      latestRank = newRank;

      if (card.metadata) {
        card.metadata.rank = newRank;
      }
    });

    try {
      // Update card keys and paths according to the new upcoming IDs.
      for (const card of cards) {
        card.path = card.path
          .split(sep)
          .map((pathPart) => {
            if (cardNameRegEx.test(pathPart)) {
              const found = templateIDMap.find(
                (element) => element.from === pathPart,
              );
              return found ? `${sep}${found.to}` : `${sep}${pathPart}`;
            }
            return `${sep}${pathPart}`;
          })
          .join('')
          .substring(1);

        const found = templateIDMap.find(
          (element) => element.from === card.key,
        );
        card.key = found ? found?.to : card.key;
      }

      // Create temp-folder and schema file.
      const templatesFolder = this.templateFolder();
      await mkdir(tempDestination, { recursive: true });
      await writeFile(
        join(tempDestination, Project.schemaContentFile),
        Template.dotSchemaContent,
      );

      // Create cards to the temp-folder.
      // @todo: new function - fetch the workflow of a card
      for (const card of cards) {
        // A bit of a hack to prevent duplicated '/c' in the path for child cards.
        if (card.path.includes(`${sep}c${sep}`) && !parentCard) {
          card.path = card.path.replace(
            `${templatesFolder}${sep}c`,
            tempDestination,
          );
        } else {
          card.path = card.path.replace(templatesFolder, tempDestination);
        }
        // @todo: could just fetch initial state based on card
        const cardtype = await this.project.cardType(card.metadata?.cardtype);
        if (!cardtype) {
          throw new Error(
            `Cardtype '${card.metadata?.cardtype}' of card ${card.key} cannot be found`,
          );
        }
        const workflow = await this.project.workflow(cardtype.workflow);
        if (!workflow) {
          throw new Error(`Workflow '${cardtype.workflow}' cannot be found`);
        }

        const initialWorkflowState = await this.project.workflowInitialState(
          workflow.name,
        );
        if (!initialWorkflowState) {
          throw new Error(
            `Workflow '${workflow.name}' initial state cannot be found`,
          );
        }
        if (card.metadata) {
          const cardWithRank = parentCards.find((c) => c.key === card.key);
          card.metadata.workflowState = initialWorkflowState;
          card.metadata.cardtype = cardtype.name;
          card.metadata.rank =
            cardWithRank?.metadata?.rank || card.metadata.rank || EMPTY_RANK;
          if (cardtype.customFields !== undefined) {
            for (const customField of cardtype.customFields) {
              const defaultValue = null;
              card.metadata = {
                ...card.metadata,
                [customField.name]:
                  card.metadata[customField.name] || defaultValue,
              };
            }
          }

          await mkdir(card.path, { recursive: true });
          await writeFile(
            join(card.path, Project.cardMetadataFile),
            formatJson(card.metadata),
          );
        }

        if (card.attachments?.length) {
          const attachmentsFolder = join(card.path, 'a');
          await mkdir(attachmentsFolder);

          await Promise.all(
            card.attachments.map(async (attachment) => {
              const attachmentUniqueName = `${card.key}-${attachment.fileName}`;
              const re = new RegExp(`image::${attachment.fileName}`, 'g');
              card.content = card.content?.replace(
                re,
                `image::${attachmentUniqueName}`,
              );
              await copyFile(
                join(attachment.path, attachment.fileName),
                join(card.path, 'a', attachmentUniqueName),
              );
            }),
          );
        }

        await writeFile(
          join(card.path, Project.cardContentFile),
          card.content || '',
        );
      }

      // Next, copy all created cards to proper place.
      if (parentCard) {
        await mkdir(parentCard.path, { recursive: true });
        await copyDir(tempDestination, parentCard.path);
      } else {
        await copyDir(tempDestination, this.project.cardrootFolder);
      }
      // Finally, delete temp folder.
      await rm(tempDestination, { recursive: true, force: true });
      await this.project.configuration.save();
    } catch (error) {
      if (error instanceof Error) {
        // If card creation causes an exception, remove 'temp'.
        await rm(tempDestination, { recursive: true, force: true });
        throw new Error(error.message);
      }
    }
    return cards;
  }

  // fetches path to module.
  private moduleTemplatePath(templateName: string): string {
    if (!pathExists(this.project.modulesFolder)) {
      return '';
    }
    const files = readdirSync(this.project.modulesFolder, {
      withFileTypes: true,
    });
    const modules = files.filter((item) => item.isDirectory());
    for (const module of modules) {
      const exists = pathExists(
        join(module?.path, module?.name, 'templates', templateName),
      );
      if (exists) {
        return join(module?.path, module?.name, 'templates', templateName);
      }
    }
    return '';
  }

  private moduleNameFromPath(template: string): string {
    const modulePath = this.moduleTemplatePath(template);
    if (modulePath !== '') {
      const parts = modulePath.split(sep);
      const modulesIndex = parts.indexOf('modules');
      if (modulesIndex === -1) {
        throw new Error(`incorrect module path: ${modulePath}`);
      }
      return parts.at(modulesIndex + 1) as string;
    }
    return '';
  }

  // Set path to template location.
  private setTemplatePath(templateName: string): string {
    const normalizedTemplateName =
      Template.normalizedTemplateName(templateName);
    if (normalizedTemplateName === '') {
      throw new Error(`Invalid template name: '${templateName}'`);
    }

    // Template can either be local ...
    const localTemplate = join(
      this.project.templatesFolder,
      normalizedTemplateName,
    );
    const createdLocalTemplate = pathExists(resolve(localTemplate));
    if (createdLocalTemplate) {
      return resolve(localTemplate);
    }

    // ... or from module ...
    const createdModuleTemplatePath = this.moduleTemplatePath(templateName);
    if (createdModuleTemplatePath !== '') {
      return resolve(createdModuleTemplatePath);
    }
    // ... or not created yet; in case assume it will be 'local' (you cannot create templates to modules)
    return resolve(localTemplate);
  }

  /**
   * Adds a new card to template.
   * @param {string} cardtype cardtype
   * @param {string} parentCard parent card; optional - if missing will create a top-level card
   * @returns next available card key ID
   */
  public async addCard(cardtype: string, parentCard?: card): Promise<string> {
    const destinationCardPath = parentCard
      ? join(await this.cardFolder(parentCard.key), 'c')
      : this.templateCardsPath;
    const defaultContent = {
      title: 'Untitled',
      cardtype: cardtype,
      workflowState: '',
    };
    let newCardKey = '';

    try {
      if (!pathExists(this.templateFolder())) {
        throw new Error(`Template '${this.containerName}' does not exist`);
      }
      if ((await this.project.cardType(cardtype)) === undefined) {
        throw new Error(`Cardtype '${cardtype}' does not exist`);
      }
      if (parentCard && !this.hasCard(parentCard.key)) {
        throw new Error(
          `Card '${parentCard.key}' does not exist in template '${this.containerName}'`,
        );
      }

      newCardKey = await this.project.newCardKey();
      const templateCardToCreate = parentCard
        ? join(destinationCardPath, newCardKey)
        : join(this.templateCardsPath, newCardKey);

      await mkdir(templateCardToCreate, { recursive: true });
      await writeFile(
        join(templateCardToCreate, Project.cardMetadataFile),
        formatJson(defaultContent),
      );
      await writeFile(join(templateCardToCreate, Project.cardContentFile), '');
      await this.project.configuration.save();
    } catch (error) {
      if (error instanceof Error) {
        // todo: does this ever really throw?
        // todo: use temp folder and destroy everything from there.
        throw new Error(error.message);
      }
    }
    return newCardKey;
  }

  /**
   * Return all attachment in the template.
   * @returns all attachments in the template.
   */
  public async attachments(): Promise<attachmentDetails[]> {
    return super.attachments(this.templateCardsPath);
  }

  /**
   * Returns path to card's attachment folder.
   * @param cardKey card key
   * @returns path to card's attachment folder.
   */
  public async cardAttachmentFolder(cardKey: string): Promise<string> {
    const pathToCard = await this.cardFolder(cardKey);
    if (!pathToCard) {
      return '';
    }
    return join(pathToCard, 'a');
  }

  /**
   * Returns details (as defined by cardDetails) of a card.
   * @param {string} cardKey card key (project prefix and a number, e.g. test_1)
   * @param {fetchCardDetails} cardDetails which card details are returned.
   * @returns Card details, or undefined if the card cannot be found.
   */
  public async cardDetailsById(
    cardKey: string,
    cardDetails: fetchCardDetails,
  ): Promise<card | undefined> {
    return super.findCard(this.templateCardsPath, cardKey, cardDetails);
  }

  /**
   * returns path to card's folder.
   * @param cardKey card key
   * @returns path to card's folder.
   */
  public async cardFolder(cardKey: string): Promise<string> {
    const found = await super.findCard(this.templateCardsPath, cardKey);
    return found ? found.path : '';
  }

  /**
   * Returns all cards in the template. Cards have content and metadata.
   * @param placeHolderPath This is not used. Needed to be compatible with base class.
   * @param details Optional. Which details are returned for each card. If missing, default value will be used.
   * @returns Template cards in the template.
   */
  public async cards(
    placeHolderPath?: string,
    details?: fetchCardDetails,
  ): Promise<card[]> {
    if (placeHolderPath) {
      console.log('Variable is not used');
    }
    const cardDetails = details
      ? details
      : { content: true, contentType: 'adoc', metadata: true };
    return super.cards(this.templateCardsPath, cardDetails);
  }

  /**
   * Creates a new template to a project.
   * todo: it would make more sense if Project would have this function
   * @returns operation details
   */
  public async create(templateContent: templateMetadata): Promise<string> {
    const isCreated = this.isCreated();
    if (!isCreated) {
      try {
        let messageText = '';
        const created = await mkdir(this.templateCardsPath, {
          recursive: true,
        }).then(async (name) => {
          await Promise.all([
            writeFile(
              this.templateConfigurationFilePath(),
              formatJson(templateContent),
            ),
            writeFile(
              join(this.templatePath, Project.schemaContentFile),
              formatJson({ id: 'template-schema', version: 1 }),
            ),
            writeFile(
              join(this.templateCardsPath, Project.schemaContentFile),
              Template.dotSchemaContent,
            ),
          ]);

          return name;
        });
        if (created) {
          const templateName = basename(created);
          messageText = `Created template '${templateName}' to folder ${this.templatePath}`;
        }
        return messageText;
      } catch (error) {
        if (error instanceof Error)
          throw new Error(
            `Could not instantiate template ${this.containerName}`,
          );
      }
    }
    return '';
  }

  /**
   * Creates cards from a template. If parent card is specified, then cards are created to underneath a parent.
   * @param parentCard parent card
   * @returns array of created card keys
   */
  public async createCards(parentCard?: card): Promise<card[]> {
    const cards = await this.cards('', {
      content: true,
      contentType: 'adoc',
      metadata: true,
      attachments: true,
      parent: true,
    });
    if (cards.length === 0) {
      throw new Error(
        `No cards in template '${this.containerName}'. Please add template cards with 'add' command first.`,
      );
    }
    return this.doCreateCards(cards, parentCard);
  }

  /**
   * Returns specific card.
   * @param cardKey Card key to find from template.
   * @param cardDetails Card details to include in return value.
   * @returns specific card details
   */
  public async findSpecificCard(
    cardKey: string,
    details: fetchCardDetails = {},
  ): Promise<card | undefined> {
    return super.findCard(this.templateCardsPath, cardKey, details);
  }

  /**
   * Checks if a specific card key exists in a template.
   * @param cardKey Card key to find from template.
   * @return true if card with a given card key exists in the template, false otherwise.
   */
  public hasCard(cardKey: string): boolean {
    return super.hasCard(cardKey, this.templateCardsPath);
  }

  /**
   * Check if template name exists already in the project.
   * @returns true, if template is exists in project; false otherwise
   */
  public isCreated(): boolean {
    return pathExists(this.templateCardsPath);
  }

  /**
   * Returns an array of all the cards in the project. Cards don't have content nor metadata.
   * @returns all cards in the project.
   */
  public async listCards(): Promise<card[]> {
    return super.cards(this.templateCardsPath);
  }

  /**
   * Returns template name without 'local'.
   * @param templateName full template name.
   * @returns template name without 'local' part, or empty string if name is invalid.
   */
  public static normalizedTemplateName(templateName: string): string {
    const parts = templateName.split(sepRegex);
    if (parts.length == 0 || parts.length > 3) {
      return '';
    }
    if (parts.length === 3) {
      if (parts[0] === 'local') {
        return parts[2];
      }
    }
    return templateName;
  }

  /**
   * Shows details of template.
   * @returns details of template
   */
  public async show(): Promise<template> {
    const name =
      this.moduleTemplatePath(this.containerName) !== ''
        ? this.moduleNameFromPath(this.containerName)
        : this.project.projectPrefix;
    return {
      name: `${name}/templates/${this.containerName}`,
      path: this.templateFolder(),
      project: this.project.projectName,
      numberOfCards: (await super.cards(this.templateCardsPath)).length,
      metadata: (await readJsonFile(
        this.templateConfigurationFilePath(),
      )) as templateMetadata,
    };
  }

  /**
   * Returns path to 'templates/<name>/c' folder.
   * @returns path to the template's folder for cards.
   */
  public templateCardsFolder(): string {
    return this.templateCardsPath;
  }

  /**
   * Path to template.json file.
   * @returns path to the template's configuration file.
   */
  public templateConfigurationFilePath(): string {
    return join(this.templatePath, 'template.json');
  }

  /**
   * Returns path to 'templates' folder.
   * @returns path to the project's folder that contains templates.
   */
  public templateFolder(): string {
    return this.templatePath;
  }

  /**
   * Returns template's project.
   * @returns {Project} Template's project.
   */
  public get templateProject(): Project {
    return this.project;
  }
}
