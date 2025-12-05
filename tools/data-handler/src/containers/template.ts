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

// node
import { basename, join, resolve, sep } from 'node:path';
import { type Dirent, readdirSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';

// Base class
import { CardContainer } from './card-container.js';

import {
  type Card,
  type CardAttachment,
  CardNameRegEx,
} from '../interfaces/project-interfaces.js';
import { pathExists, stripExtension } from '../utils/file-utils.js';
import { DefaultContent } from '../resources/create-defaults.js';

import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  sortItems,
} from '../utils/lexorank.js';
import { getChildLogger } from '../utils/log-utils.js';
import { isModulePath } from '../utils/card-utils.js';
import { Project } from './project.js';
import { resourceName } from '../utils/resource-utils.js';

import { ROOT } from '../utils/constants.js';

// @todo: Fix the constructor to not use Resource.
import type { Resource } from './project/resource-cache.js';

// creates template instance based on a project path and name
export class Template extends CardContainer {
  private templateName: string;
  private templatePath: string;
  private templateCardsPath: string;
  private fullTemplateName: string; // Full template name from resource (e.g., 'test/templates/page')
  private project: Project;
  private get logger() {
    return getChildLogger({
      module: 'template',
    });
  }

  /**
   * Creates an instance of Template container that holds template related cards.
   * @param project Project in which template is.
   * @param template Template resource that this container is connected to.
   */
  // @todo: Fix the constructor to not use Resource, but resource full path
  constructor(project: Project, template: Resource) {
    // Templates might come from modules. Remove module name from template name.
    const templateName = stripExtension(basename(template.name));
    super(template.path, project.projectPrefix);
    this.templateName = templateName;
    this.fullTemplateName = template.name;

    this.project = project;
    // optimization - if template.path is set - use it
    this.templatePath =
      template.path && template.path.length > 0
        ? join(template.path, templateName)
        : this.setTemplatePath(template.name);
    this.templateCardsPath = join(this.templatePath, 'c');
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
        cards.filter((c) => c.parent === ROOT),
        (c) => c?.metadata?.rank || '',
      );

      const futureSiblings = parentCard
        ? this.project.cardKeysToCards(parentCard.children)
        : this.rootLevelProjectCards();

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

      // Set parent field based on template hierarchy and creation location
      // Store the original template parent before key remapping
      const originalParentKey = card.parent;

      if (parentCard) {
        if (!originalParentKey || originalParentKey === ROOT) {
          card.parent = parentCard.key;
        } else {
          card.parent = templateIDMap.get(originalParentKey) || parentCard.key;
        }
      } else {
        if (!originalParentKey || originalParentKey === ROOT) {
          card.parent = ROOT;
        } else {
          card.parent = templateIDMap.get(originalParentKey) || ROOT;
        }
      }
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
            new RegExp(
              `(\\{\\{#image\\}\\}[^}]*)"fileName": "${attachment.fileName}"([^}]*\\{\\{\\/image\\}\\})`,
              'g',
            ),
            `$1"fileName": "${attachmentUniqueName}"$2`,
          );
          // keep fallback
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
      const cardType = this.project.resources
        .byType(card.metadata?.cardType, 'cardTypes')
        .show();

      const workflow = this.project.resources
        .byType(cardType.workflow, 'workflows')
        .show();

      const initialWorkflowState = workflow.transitions.find(
        (item) => item.fromState.includes('') || item.fromState.length === 0,
      );
      if (!initialWorkflowState) {
        throw new Error(
          `Workflow '${cardType.workflow}' initial state cannot be found`,
        );
      }

      const cardWithRank = parentCards.find((c) => c.key === card.key);
      const customFields = cardType.customFields
        .filter((item) => !item.isCalculated)
        .reduce(
          (acc, field) => ({
            ...acc,
            [field.name]: card.metadata?.[field.name] || null,
          }),
          {},
        );

      const newMetadata = {
        ...card.metadata,
        ...customFields,
        templateCardKey: [...templateIDMap]
          .find(([, value]) => value === card.key)!
          .at(0),
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
      // Create deep copies to avoid mutating the cached template cards
      const processedCards = await Promise.all(
        cards.map(async (originalCard) => {
          const card: Card = structuredClone(originalCard);
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
            this.saveCardMetadata(processedCard),
            writeFile(
              join(processedCard.path, Project.cardContentFile),
              processedAttachments.content || '',
            ),
          ]);
          return processedCard;
        }),
      );
      await this.project.handleNewCards(processedCards);
      return processedCards;
    } catch (error) {
      await this.removeCards(templateIDMap);
      this.logger.error({ error }, 'Failed to create cards');
      throw error;
    }
  }

  // Helper method to find a card.
  private findCardDirect(cardKey: string): Card {
    const allCards = this.cards();
    const result = allCards.find((card) => card.key === cardKey);
    if (!result) {
      throw new Error(`Card '${cardKey}' is not part of template`);
    }
    return result;
  }

  // fetches path to module.
  private moduleTemplatePath(templateName: string): string {
    // If template path has already been deduced, return it.
    if (pathExists(this.templatePath)) {
      return this.templatePath;
    }
    let modules: Dirent[] = [];
    try {
      modules = readdirSync(this.project.paths.modulesFolder, {
        withFileTypes: true,
      }).filter((item) => item.isDirectory());
    } catch {
      // do nothing, if modules folder does not exist
    }
    for (const module of modules) {
      const templateFolderInModule = join(
        module.parentPath,
        module.name,
        'templates',
        templateName,
      );
      const exists = pathExists(templateFolderInModule);
      if (exists) {
        this.templatePath = templateFolderInModule;
        return templateFolderInModule;
      }
    }
    return '';
  }

  // Removes cards
  // Helper for doCreateCards; not intended for any other use.
  private async removeCards(cardMap: Map<string, string>) {
    const cards: Card[] = [];
    // Find all cards that need to be removed.
    cardMap.forEach((createdCard) => {
      const card = this.project.findCard(createdCard);
      cards.push(card);
    });
    // Delete card folders.
    const deleteAll: Promise<void>[] = [];
    cards.forEach((card) => {
      deleteAll.push(rm(card.path, { force: true, recursive: true }));
    });
    await Promise.all(deleteAll);
  }

  // Fetches project top level cards only.
  private rootLevelProjectCards(): Card[] {
    const allProjectCards = this.project.cards(
      this.project.paths.cardRootFolder,
    );
    return allProjectCards.filter((card) => card.parent === ROOT);
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
   * @param cardTypeName card type
   * @param parentCard parent card; optional - if missing will create a top-level card
   * @returns next available card key ID
   */
  public async addCard(
    cardTypeName: string,
    parentCard?: Card,
  ): Promise<string> {
    const destinationCardPath = parentCard
      ? join(this.cardFolder(parentCard.key), 'c')
      : this.templateCardsPath;
    let newCardKey = '';

    try {
      // todo: to use cache instead of file access
      if (!pathExists(this.templateFolder())) {
        throw new Error(`Template '${this.templateName}' does not exist`);
      }
      const cardType = this.project.resources
        .byType(cardTypeName, 'cardTypes')
        .show();

      if (parentCard && !this.hasTemplateCard(parentCard.key)) {
        throw new Error(
          `Card '${parentCard.key}' does not exist in template '${this.templateName}'`,
        );
      }

      const cardIds = await this.project.listCardIds();
      newCardKey = this.project.newCardKey(cardIds);
      const templateCardToCreate = parentCard
        ? join(destinationCardPath, newCardKey)
        : join(this.templateCardsPath, newCardKey);

      const templateCards = parentCard
        ? this.project.cardKeysToCards(parentCard.children)
        : this.cards();
      const defaultContent = DefaultContent.card(cardType, templateCards);

      await mkdir(templateCardToCreate, { recursive: true });
      const defaultCard: Card = {
        key: basename(templateCardToCreate),
        path: templateCardToCreate,
        metadata: defaultContent,
        children: [],
        attachments: [],
        content: '',
        parent: parentCard ? parentCard.key : ROOT,
      };
      await this.saveCard(defaultCard);
      await this.project.handleNewCards([defaultCard]);
    } catch (error) {
      this.logger.error({ error });
      throw error;
    }
    return newCardKey;
  }

  /**
   * Return all attachment in the template.
   * @returns all attachments in the template.
   */
  public attachments(): CardAttachment[] {
    return this.project.attachmentsByPath(this.templateCardsPath);
  }

  /**
   * Returns path to card's attachment folder.
   * @param cardKey card key
   * @returns path to card's attachment folder.
   */
  public cardAttachmentFolder(cardKey: string): string {
    const pathToCard = this.project.findCard(cardKey)?.path;
    return join(pathToCard, 'a');
  }

  /**
   * returns path to card's folder.
   * @param cardKey card key
   * @returns path to card's folder.
   */
  public cardFolder(cardKey: string): string {
    const found = this.findCardDirect(cardKey);
    return found ? found.path : '';
  }

  /**
   * Returns all cards in the template.
   * @param placeHolderPath This is not used. Needed to be compatible with base class.
   * @returns Template cards in the template.
   */
  public cards(placeHolderPath?: string): Card[] {
    if (placeHolderPath) {
      this.logger.warn('A non-used variable was used in the cards method');
    }

    // Filter cards from the project's card cache that belong to this template.
    const allCards = [...this.project.cardsCache.getCards()];
    return allCards.filter(
      (card) =>
        card.location !== 'project' && card.location === this.fullTemplateName,
    );
  }

  /**
   * Creates cards from a template. If parent card is specified, then cards are created to underneath a parent.
   * @param parentCard parent card
   * @returns array of created card keys
   */
  public async createCards(parentCard?: Card): Promise<Card[]> {
    const cards = this.cards();
    if (cards.length === 0) {
      throw new Error(
        `No cards in template '${this.templateName}'. Please add template cards with 'add' command first.`,
      );
    }
    return this.doCreateCards(cards, parentCard);
  }

  /**
   * Returns specific card.
   * @param cardKey Card key to find from template.
   * @returns specific card details
   */
  public findCard(cardKey: string): Card {
    const cardPrefix = cardKey.split('_').at(0);
    const moduleCardFromProject =
      this.basePath.includes('local') &&
      this.project.projectPrefix !== cardPrefix;
    const projectCardFromModule =
      this.basePath.includes('modules') &&
      this.project.projectPrefix === cardPrefix;
    // If the result is impossible, return undefined.
    if (moduleCardFromProject || projectCardFromModule) {
      throw new Error(`Card '${cardKey}' is not part of template`);
    }

    return this.findCardDirect(cardKey);
  }

  /**
   * Checks if a specific card key exists in a template.
   * @param cardKey Card key to find from template.
   * @returns true if card with a given card key exists in the template, false otherwise.
   */
  public hasTemplateCard(cardKey: string): boolean {
    return this.project.hasTemplateCard(cardKey);
  }

  /**
   * Check if template name exists already in the project.
   * @returns true, if template is exists in project; false otherwise
   */
  public isCreated(): boolean {
    // todo: to use cache instead of file access
    return pathExists(this.templateCardsPath);
  }

  /**
   * Returns an array of all the cards in the template.
   * @returns all cards in the template.
   */
  public listCards(): Card[] {
    // Construct the full template name to match what's stored in cache
    const fullTemplateName = isModulePath(this.basePath)
      ? `${this.basePath.split(`${sep}modules${sep}`)[1].split(`${sep}templates`)[0]}/templates/${this.templateName}`
      : `${this.project.projectPrefix}/templates/${this.templateName}`;

    const templateCards = Array.from(this.project.cardsCache.getCards()).filter(
      (cachedCard) => {
        if (cachedCard.location === 'project') {
          return false;
        }
        const storedTemplateName = cachedCard.location;
        return storedTemplateName === fullTemplateName;
      },
    );
    return templateCards;
  }

  /**
   * Returns path to 'templates/<name>/c' folder.
   * @returns path to the template's folder for cards.
   */
  public templateCardsFolder(): string {
    return this.templateCardsPath;
  }

  /**
   * Returns path to 'templates' folder.
   * @returns path to the project's folder that contains templates.
   */
  public templateFolder(): string {
    return this.templatePath;
  }
}
