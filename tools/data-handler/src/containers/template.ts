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

import {
  Card,
  CardAttachment,
  CardNameRegEx,
  DotSchemaItem,
  FetchCardDetails,
  FileContentType,
  Resource,
  TemplateConfiguration as TemplateInterface,
} from '../interfaces/project-interfaces.js';
import { TemplateMetadata } from '../interfaces/resource-interfaces.js';
import { copyDir, pathExists } from '../utils/file-utils.js';
import { readJsonFile, writeJsonFile } from '../utils/json.js';
import { Project } from './project.js';

// Base class
import { CardContainer } from './card-container.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  sortItems,
} from '../utils/lexorank.js';
import { logger } from '../utils/log-utils.js';
import { resourceNameParts } from '../utils/resource-utils.js';

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

  private static DotSchemaContentForCard: DotSchemaItem[] = [
    {
      id: 'cardBaseSchema',
      version: 1,
    },
  ];

  private static DotSchemaContentForTemplate: DotSchemaItem[] = [
    {
      id: 'templateSchema',
      version: 1,
    },
  ];

  constructor(project: Project, template: Resource) {
    // Templates might come from modules. Remove module name from template name.
    const templateName = basename(template.name);
    super(template.path!, templateName);

    // prevent constructing a new project object, if one is passed to this class.
    this.project = project ? project : new Project(this.basePath);
    // optimization - if template.path is set - use it
    this.templatePath =
      template.path && template.path.length > 0
        ? join(template.path, templateName)
        : this.setTemplatePath(template.name);
    this.templateCardsPath = join(this.templatePath, 'c');
  }

  // Creates card(s) as project cards from template.
  // optimize: first make temp file, them copy all template cards to it as-is.
  //           Then rename the folder based on mapped names.
  //           Make 'card' item changed to write them to json file.
  //           Finally copy from temp to real place.
  private async doCreateCards(
    cards: Card[],
    parentCard?: Card,
  ): Promise<Card[]> {
    const templateIDMap: mappingValue[] = [];
    const tempDestination = this.project.paths.tempCardFolder;

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
      cards.filter((c) => c.parent === 'root'),
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
            if (CardNameRegEx.test(pathPart)) {
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
      await writeJsonFile(
        join(tempDestination, Project.schemaContentFile),
        Template.DotSchemaContentForCard,
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
        const cardType = await this.project.cardType(
          card.metadata?.cardType || '',
        );
        if (!cardType) {
          throw new Error(
            `Card type '${card.metadata?.cardType}' of card ${card.key} cannot be found`,
          );
        }
        const workflow = await this.project.workflow(cardType.workflow);
        if (!workflow) {
          throw new Error(`Workflow '${cardType.workflow}' cannot be found`);
        }

        const initialWorkflowState = await this.project.workflowInitialState(
          cardType.workflow,
        );
        if (!initialWorkflowState) {
          throw new Error(
            `Workflow '${cardType.workflow}' initial state cannot be found`,
          );
        }
        if (card.metadata) {
          const cardWithRank = parentCards.find((c) => c.key === card.key);
          card.metadata.workflowState = initialWorkflowState;
          card.metadata.cardType = cardType.name;
          card.metadata.rank =
            cardWithRank?.metadata?.rank || card.metadata.rank || EMPTY_RANK;
          for (const customField of cardType.customFields) {
            const defaultValue = null;
            card.metadata = {
              ...card.metadata,
              [customField.name]:
                card.metadata[customField.name] || defaultValue,
            };
          }

          await mkdir(card.path, { recursive: true });
          await writeJsonFile(
            join(card.path, Project.cardMetadataFile),
            card.metadata,
          );
        }

        if (card.attachments.length) {
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
        await copyDir(tempDestination, this.project.paths.cardRootFolder);
      }
      // Finally, delete temp folder.
      await rm(tempDestination, { recursive: true, force: true });
    } catch (error) {
      if (error instanceof Error) {
        // If card creation causes an exception, remove 'temp'.
        await rm(tempDestination, { recursive: true, force: true });
        throw new Error(error.message);
      }
    }
    return cards;
  }

  // Returns the latest rank in the given array of cards.
  private latestRank(cards: Card[]): string {
    // Only use cards that have 'rank'.
    const filteredCards = cards.filter(
      (c) => c.metadata?.rank !== undefined || c.metadata?.rank !== '',
    );

    let latestRank = sortItems(
      filteredCards,
      (c) => c.metadata?.rank || '',
    ).pop()?.metadata?.rank;

    if (!latestRank) {
      latestRank = FIRST_RANK;
    }

    const newRank = getRankAfter(latestRank as string);
    latestRank = newRank;
    return latestRank;
  }

  // fetches path to module.
  private moduleTemplatePath(templateName: string): string {
    if (!pathExists(this.project.paths.modulesFolder)) {
      return '';
    }
    const files = readdirSync(this.project.paths.modulesFolder, {
      withFileTypes: true,
    });
    const modules = files.filter((item) => item.isDirectory());
    for (const module of modules) {
      const exists = pathExists(
        join(module?.parentPath, module?.name, 'templates', templateName),
      );
      if (exists) {
        return join(
          module?.parentPath,
          module?.name,
          'templates',
          templateName,
        );
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
    const { prefix, identifier } = resourceNameParts(templateName);
    const localTemplate = join(this.project.paths.templatesFolder, identifier);

    // Template can either be local ...
    if (prefix === this.project.projectPrefix) {
      const localTemplate = join(
        this.project.paths.templatesFolder,
        identifier,
      );
      const createdLocalTemplate = pathExists(resolve(localTemplate));
      if (createdLocalTemplate) {
        return resolve(localTemplate);
      }
    }

    // ... or from module ...
    const createdModuleTemplatePath = this.moduleTemplatePath(identifier);
    if (createdModuleTemplatePath !== '') {
      return resolve(createdModuleTemplatePath);
    }

    // ... or not created yet; in case assume it will be 'local' (you cannot create templates to modules)
    return resolve(localTemplate);
  }

  /**
   * Adds a new card to template.
   * @param cardType card type
   * @param parentCard parent card; optional - if missing will create a top-level card
   * @returns next available card key ID
   */
  public async addCard(cardType: string, parentCard?: Card): Promise<string> {
    const destinationCardPath = parentCard
      ? join(await this.cardFolder(parentCard.key), 'c')
      : this.templateCardsPath;
    const defaultContent = {
      title: 'Untitled',
      cardType: cardType,
      workflowState: '',
      rank: '',
    };
    let newCardKey = '';

    try {
      if (!pathExists(this.templateFolder())) {
        throw new Error(`Template '${this.containerName}' does not exist`);
      }
      if ((await this.project.cardType(cardType)) === undefined) {
        throw new Error(`Card type '${cardType}' does not exist`);
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

      const templateCards = parentCard
        ? parentCard.children || []
        : await this.cards();
      defaultContent.rank = this.latestRank(templateCards);

      await mkdir(templateCardToCreate, { recursive: true });
      await writeJsonFile(
        join(templateCardToCreate, Project.cardMetadataFile),
        defaultContent,
      );
      await writeFile(join(templateCardToCreate, Project.cardContentFile), '');
    } catch (error) {
      if (error instanceof Error) {
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
  public async attachments(): Promise<CardAttachment[]> {
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
   * @param cardKey card key (project prefix and a number, e.g. test_1)
   * @param cardDetails which card details are returned.
   * @returns Card details, or undefined if the card cannot be found.
   */
  public async cardDetailsById(
    cardKey: string,
    cardDetails: FetchCardDetails,
  ): Promise<Card | undefined> {
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
    details?: FetchCardDetails,
  ): Promise<Card[]> {
    if (placeHolderPath) {
      logger.warn('A non-used variable was used in the cards method');
    }
    const cardDetails = details
      ? details
      : {
          content: true,
          contentType: 'adoc' as FileContentType,
          metadata: true,
        };
    return super.cards(this.templateCardsPath, cardDetails);
  }

  /**
   * Creates a new template to a project.
   * todo: it would make more sense if Project would have this function
   * @returns message text with details of creating; or empty string when template was already created.
   */
  public async create(templateContent: TemplateMetadata): Promise<string> {
    const isCreated = this.isCreated();
    if (!isCreated) {
      try {
        let messageText = '';
        const created = await mkdir(this.templateCardsPath, {
          recursive: true,
        }).then(async (name) => {
          await Promise.all([
            writeJsonFile(
              this.templateConfigurationFilePath(),
              templateContent,
            ),
            writeJsonFile(
              join(this.templatePath, Project.schemaContentFile),
              Template.DotSchemaContentForTemplate,
            ),
            writeJsonFile(
              join(this.templateCardsPath, Project.schemaContentFile),
              Template.DotSchemaContentForCard,
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
  public async createCards(parentCard?: Card): Promise<Card[]> {
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
   * @param details Card details to include in return value.
   * @returns specific card details
   */
  public async findSpecificCard(
    cardKey: string,
    details: FetchCardDetails = {},
  ): Promise<Card | undefined> {
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
  public async listCards(): Promise<Card[]> {
    return super.cards(this.templateCardsPath);
  }

  /**
   * Shows details of template.
   * @returns details of template
   */
  public async show(): Promise<TemplateInterface> {
    const name =
      this.moduleTemplatePath(this.containerName) !== ''
        ? this.moduleNameFromPath(this.containerName)
        : this.project.projectPrefix;
    return {
      name: `${name}/templates/${this.containerName}`,
      path: this.templateFolder(),
      numberOfCards: (await super.cards(this.templateCardsPath)).length,
      metadata: (await readJsonFile(
        this.templateConfigurationFilePath(),
      )) as TemplateMetadata,
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
   * @returns Template's project.
   */
  public get templateProject(): Project {
    return this.project;
  }
}
