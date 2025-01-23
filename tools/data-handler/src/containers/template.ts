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
import { copyFile, mkdir, readdir, rmdir, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';

// Base class
import { CardContainer } from './card-container.js';

import {
  Card,
  CardAttachment,
  CardNameRegEx,
  FetchCardDetails,
  FileContentType,
  Resource,
} from '../interfaces/project-interfaces.js';
import { CardType, Workflow } from '../interfaces/resource-interfaces.js';
import { pathExists, stripExtension } from '../utils/file-utils.js';
import { DefaultContent } from '../resources/create-defaults.js';

import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  sortItems,
} from '../utils/lexorank.js';
import { logger } from '../utils/log-utils.js';
import { readJsonFile } from '../utils/json.js';
import { Project } from './project.js';
import { resourceName } from '../utils/resource-utils.js';

// creates template instance based on a project path and name
export class Template extends CardContainer {
  private templatePath: string;
  private templateCardsPath: string;
  private project: Project;

  constructor(project: Project, template: Resource) {
    // Templates might come from modules. Remove module name from template name.
    const templateName = stripExtension(basename(template.name));
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

  // Fetches project top level cards only.
  // Top level cards are those that have parent as 'root'.
  // todo: This should be in 'project' or 'card-container'
  private async rootLevelProjectCards(): Promise<Card[]> {
    const entries = (
      await readdir(this.project.paths.cardRootFolder, {
        withFileTypes: true,
      })
    ).filter((entry) => entry.isDirectory() && CardNameRegEx.test(entry.name));
    const cardPromises = entries.map(async (entry) => {
      const currentPath = join(entry.parentPath, entry.name);
      return {
        key: entry.name,
        path: currentPath,
        metadata: await readJsonFile(
          join(currentPath, CardContainer.cardMetadataFile),
        ),
        children: [],
        attachments: [],
      };
    });
    return Promise.all(cardPromises);
  }

  // Creates card(s) as project cards from template.
  private async doCreateCards(
    cards: Card[],
    parentCard?: Card,
  ): Promise<Card[]> {
    const templateIDMap = new Map<string, string>();
    // Create ID mapping and update ranks
    const createMappingAndRanks = async () => {
      const cardIds = await this.project.listCardIds();
      const newCardIds = this.project.newCardKeys(cards.length, cardIds);

      // Create mapping table
      cards.forEach((card, index) => {
        templateIDMap.set(card.key, newCardIds.at(index) || '');
      });

      // Handle ranking for parent cards
      const parentCards = sortItems(
        cards.filter((c) => c.parent === 'root'),
        (c) => c?.metadata?.rank || '',
      );

      const futureSiblings = parentCard
        ? parentCard.children || []
        : await this.rootLevelProjectCards();

      let latestRank =
        sortItems(
          futureSiblings.filter((c) => c.metadata?.rank !== undefined),
          (c) => c.metadata?.rank || '',
        ).pop()?.metadata?.rank || FIRST_RANK;

      // Update ranks
      parentCards.forEach((card) => {
        latestRank = getRankAfter(latestRank);
        if (card.metadata) {
          card.metadata.rank = latestRank;
        }
      });

      return parentCards;
    };

    // Update paths and keys
    const updateCardPaths = (
      card: Card,
      templateIDMap: Map<string, string>,
      templatesFolder: string,
    ) => {
      const updatePathPart = (part: string) =>
        CardNameRegEx.test(part)
          ? `${sep}${templateIDMap.get(part) || part}`
          : `${sep}${part}`;

      card.path = card.path
        .split(sep)
        .map(updatePathPart)
        .join('')
        .substring(1);

      if (card.path.includes(`${sep}c${sep}`) && !parentCard) {
        card.path = card.path.replace(
          `${templatesFolder}${sep}c`,
          this.project.paths.cardRootFolder,
        );
      } else {
        card.path = card.path.replace(
          templatesFolder,
          parentCard ? parentCard.path : this.project.paths.cardRootFolder,
        );
      }

      card.key = templateIDMap.get(card.key) || card.key;
    };

    // Process attachments
    const processAttachments = async (card: Card) => {
      if (!card.attachments.length) return card;

      const attachmentsFolder = join(card.path, 'a');
      await mkdir(attachmentsFolder, { recursive: true });

      let content = card.content;
      await Promise.all(
        card.attachments.map(async (attachment) => {
          const attachmentUniqueName = `${card.key}-${attachment.fileName}`;
          content = content?.replace(
            new RegExp(`image::${attachment.fileName}`, 'g'),
            `image::${attachmentUniqueName}`,
          );
          await copyFile(
            join(attachment.path, attachment.fileName),
            join(card.path, 'a', attachmentUniqueName),
          );
        }),
      );
      return { ...card, content };
    };

    // Process metadata
    const processMetadata = async (card: Card, parentCards: Card[]) => {
      if (!card.metadata) return card;

      const cardType = await this.project.resource<CardType>(
        card.metadata.cardType || '',
      );
      if (!cardType) {
        throw new Error(
          `Card type '${card.metadata.cardType}' of card ${card.key} cannot be found`,
        );
      }

      const workflow = await this.project.resource<Workflow>(cardType.workflow);
      if (!workflow) {
        throw new Error(`Workflow '${cardType.workflow}' cannot be found`);
      }
      const initialWorkflowState = workflow.transitions.find(
        (item) => item.fromState.includes('') || item.fromState.length === 0,
      );
      if (!initialWorkflowState) {
        throw new Error(
          `Workflow '${cardType.workflow}' initial state cannot be found`,
        );
      }

      const cardWithRank = parentCards.find((c) => c.key === card.key);
      const customFields = cardType.customFields.reduce(
        (acc, field) => ({
          ...acc,
          [field.name]: card.metadata?.[field.name] || null,
        }),
        {},
      );

      const newMetadata = {
        ...card.metadata,
        ...customFields,
        workflowState: initialWorkflowState.toState,
        cardType: cardType.name,
        rank: cardWithRank?.metadata?.rank || card.metadata.rank || EMPTY_RANK,
      };

      return { ...card, metadata: newMetadata };
    };

    try {
      // Create mapping and handle ranks
      const parentCards = await createMappingAndRanks();
      const templatesFolder = this.templateFolder();

      // Process all cards in parallel
      const processedCards = await Promise.all(
        cards.map(async (card) => {
          // Update paths and keys
          updateCardPaths(card, templateIDMap, templatesFolder);

          // Process metadata and attachments in parallel
          const [processedCard, processedAttachments] = await Promise.all([
            processMetadata(card, parentCards),
            processAttachments(card),
          ]);

          // Create directory and write files
          await mkdir(processedCard.path, { recursive: true });

          await Promise.all([
            processedCard.metadata && this.saveCardMetadata(processedCard),
            writeFile(
              join(processedCard.path, Project.cardContentFile),
              processedAttachments.content || '',
            ),
          ]);
          return processedCard;
        }),
      );
      return processedCards;
    } catch (error) {
      await this.removeCards(templateIDMap);
      if (error instanceof Error) {
        throw new Error(`Failed to create cards: ${error.message}`);
      }
      throw error;
    }
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
    // If template path has already been deduced, return it.
    if (pathExists(this.templatePath)) {
      return this.templatePath;
    }
    const modules = readdirSync(this.project.paths.modulesFolder, {
      withFileTypes: true,
    }).filter((item) => item.isDirectory());
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

  // Removes cards
  private async removeCards(cardMap: Map<string, string>) {
    const tasks: Promise<Card | undefined>[] = [];
    // Find all cards that need to be removed.
    cardMap.forEach((createdCard) => {
      tasks.push(this.project.findSpecificCard(createdCard));
    });
    // Remove empty results.
    const cards = (await Promise.all(tasks)).filter(
      (item) => item !== undefined,
    );
    // Delete card folders.
    const deleteAll: Promise<void>[] = [];
    cards.forEach((card) => {
      deleteAll.push(rmdir(card.path, { recursive: true }));
    });
    await Promise.all(deleteAll);
  }

  // Set path to template location.
  private setTemplatePath(templateName: string): string {
    const { prefix, identifier } = resourceName(templateName);
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
    let newCardKey = '';

    try {
      if (!pathExists(this.templateFolder())) {
        throw new Error(`Template '${this.containerName}' does not exist`);
      }
      if ((await this.project.resource<CardType>(cardType)) === undefined) {
        throw new Error(`Card type '${cardType}' does not exist`);
      }
      if (parentCard && !this.hasCard(parentCard.key)) {
        throw new Error(
          `Card '${parentCard.key}' does not exist in template '${this.containerName}'`,
        );
      }

      const defaultContent = DefaultContent.card(cardType);
      const cardIds = await this.project.listCardIds();
      newCardKey = await this.project.newCardKey(cardIds);
      const templateCardToCreate = parentCard
        ? join(destinationCardPath, newCardKey)
        : join(this.templateCardsPath, newCardKey);

      const templateCards = parentCard
        ? parentCard.children || []
        : await this.cards();
      defaultContent.rank = this.latestRank(templateCards);

      await mkdir(templateCardToCreate, { recursive: true });
      const defaultCard: Card = {
        key: basename(templateCardToCreate),
        path: templateCardToCreate,
        metadata: defaultContent,
        children: [],
        attachments: [],
        content: '',
      };
      await this.saveCard(defaultCard);
    } catch (error) {
      if (error instanceof Error) {
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
   * Returns path to 'templates/<name>/c' folder.
   * @returns path to the template's folder for cards.
   */
  public templateCardsFolder(): string {
    return this.templateCardsPath;
  }

  /**
   * Path to template configuration json file.
   * @returns path to the template's configuration file.
   */
  public templateConfigurationFilePath(): string {
    return join(this.templatePath, '..', this.containerName + '.json');
  }

  /**
   * Returns path to 'templates' folder.
   * @returns path to the project's folder that contains templates.
   */
  public templateFolder(): string {
    return this.templatePath;
  }
}
