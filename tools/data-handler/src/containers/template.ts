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
import { basename, join, resolve } from 'node:path';
import { type Dirent, readdirSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';

// Base class
import { CardContainer } from './card-container.js';

import type { Card, CardAttachment } from '../interfaces/project-interfaces.js';
import { pathExists, stripExtension } from '../utils/file-utils.js';
import { DefaultContent } from '../resources/create-defaults.js';

import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  sortItems,
} from '../utils/lexorank.js';
import { getChildLogger } from '../utils/log-utils.js';
import type { Project } from './project.js';
import { isInitialTransition, resourceName } from '../utils/resource-utils.js';

import { isPredefinedField, ROOT } from '../utils/constants.js';

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

  private async buildCardKeyMap(cards: Card[]): Promise<Map<string, string>> {
    const cardIds = await this.project.listCardIds();
    const newCardIds = this.project.newCardKeys(cards.length, cardIds);
    const cardsByKey = new Map<string, string>();
    cards.forEach((card, index) => {
      cardsByKey.set(card.key, newCardIds.at(index) || '');
    });
    return cardsByKey;
  }

  private rootCardRanks(
    cards: Card[],
    parentCard: Card | undefined,
  ): Map<string, string> {
    const getRank = (card: Card) => card?.metadata?.rank || '';
    const rootCards = sortItems(
      cards.filter((c) => c.parent === ROOT),
      getRank,
    );

    const futureSiblings = parentCard
      ? this.project.cardKeysToCards(parentCard.children)
      : this.rootLevelProjectCards();

    let latestRank =
      sortItems(
        futureSiblings.filter((c) => c.metadata?.rank !== undefined),
        getRank,
      ).pop()?.metadata?.rank || FIRST_RANK;

    const ranks = new Map<string, string>();
    for (const card of rootCards) {
      latestRank = getRankAfter(latestRank);
      ranks.set(card.key, latestRank);
    }
    return ranks;
  }

  // Rewrites an instantiated card's identity and tree position: its own key,
  // its children's keys, and its parent — either the card the template is
  // instantiated under, or the instantiated copy of its template parent.
  private remapCardPosition(
    card: Card,
    templateIDMap: Map<string, string>,
    parentCard?: Card,
  ): void {
    // The original template parent, before the key remapping below.
    const originalParentKey = card.parent;

    card.key = templateIDMap.get(card.key) || card.key;
    card.children = card.children.map(
      (childKey) => templateIDMap.get(childKey) || childKey,
    );

    const isTemplateRootCard = !originalParentKey || originalParentKey === ROOT;
    if (parentCard) {
      card.parent = isTemplateRootCard
        ? parentCard.key
        : templateIDMap.get(originalParentKey) || parentCard.key;
      return;
    }
    card.parent = isTemplateRootCard
      ? ROOT
      : templateIDMap.get(originalParentKey) || ROOT;
  }

  // Places a batch of instantiated cards on disk: a card whose parent is also
  // in the batch goes into the parent's 'c' folder, everything else goes
  // directly into the destination folder.
  private assignInstantiatedPaths(cards: Card[], destinationFolder: string) {
    const byKey = new Map(cards.map((card) => [card.key, card]));
    const paths = new Map<string, string>();

    const pathOf = (card: Card): string => {
      const known = paths.get(card.key);
      if (known) {
        return known;
      }
      const parentInBatch =
        card.parent && card.parent !== ROOT
          ? byKey.get(card.parent)
          : undefined;
      const path = parentInBatch
        ? join(pathOf(parentInBatch), 'c', card.key)
        : join(destinationFolder, card.key);
      paths.set(card.key, path);
      return path;
    };

    for (const card of cards) {
      card.path = pathOf(card);
    }
  }

  private async processAttachments(card: Card): Promise<Card> {
    if (!card.attachments.length) return card;

    const attachmentsFolder = join(card.path, 'a');
    await mkdir(attachmentsFolder, { recursive: true });

    let content = card.content;
    const attachments: CardAttachment[] = card.attachments.map((attachment) => {
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
      return {
        ...attachment,
        card: card.key,
        path: attachmentsFolder,
        fileName: attachmentUniqueName,
      };
    });

    await Promise.all(
      card.attachments.map((attachment, index) =>
        copyFile(
          join(attachment.path, attachment.fileName),
          join(attachmentsFolder, attachments[index].fileName),
        ),
      ),
    );
    return { ...card, content, attachments };
  }

  private async processMetadata(
    card: Card,
    rootCardRanks: Map<string, string>,
    templateIDMap: Map<string, string>,
  ): Promise<Card> {
    if (!card.metadata) return card;

    const cardType = this.project.resources
      .byType(card.metadata?.cardType, 'cardTypes')
      .show();

    const workflow = this.project.resources
      .byType(cardType.workflow, 'workflows')
      .show();

    const initialWorkflowState = workflow.transitions.find(isInitialTransition);
    if (!initialWorkflowState) {
      throw new Error(
        `Workflow '${cardType.workflow}' initial state cannot be found`,
      );
    }

    let templateCardKey;
    for (const [key, value] of templateIDMap) {
      if (value === card.key) {
        templateCardKey = key;
        break;
      }
    }
    const allocatedRank = templateCardKey
      ? rootCardRanks.get(templateCardKey)
      : undefined;
    const newMetadata = {
      ...card.metadata,
      templateCardKey,
      workflowState: initialWorkflowState.toState,
      cardType: cardType.name,
      createdAt: new Date().toISOString(),
      rank: allocatedRank || card.metadata.rank || EMPTY_RANK,
    };

    // Null custom-field values on the template card are a 'no value' marker, not content.
    for (const [key, value] of Object.entries(newMetadata)) {
      if (value === null && !isPredefinedField(key)) {
        delete (newMetadata as Record<string, unknown>)[key];
      }
    }

    return { ...card, metadata: newMetadata };
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

  // Deletes the card folders createCards had begun writing.
  // Helper for createCards; not intended for any other use.
  private async removeCards(cardPaths: string[]) {
    await Promise.all(
      cardPaths.map((path) => rm(path, { force: true, recursive: true })),
    );
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
    const [newCardKey] = await this.addCards(cardTypeName, 1, parentCard);
    return newCardKey;
  }

  /**
   * Adds new cards to the template.
   * @param cardTypeName card type for the new cards
   * @param count how many cards to add
   * @param parentCard parent card; optional - if missing will create top-level cards
   * @returns card key IDs of the added cards, in rank order
   */
  public async addCards(
    cardTypeName: string,
    count: number,
    parentCard?: Card,
  ): Promise<string[]> {
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

      const destinationCardPath = parentCard
        ? join(this.cardFolder(parentCard.key), 'c')
        : this.templateCardsPath;

      const cardIds = await this.project.listCardIds();
      const newCardKeys = this.project.newCardKeys(count, cardIds);

      const siblings = parentCard
        ? this.project.cardKeysToCards(parentCard.children)
        : this.cards();

      const newCards: Card[] = [];
      for (const newCardKey of newCardKeys) {
        newCards.push({
          key: newCardKey,
          path: join(destinationCardPath, newCardKey),
          metadata: DefaultContent.card(cardType, [...siblings, ...newCards]),
          children: [],
          attachments: [],
          content: '',
          parent: parentCard ? parentCard.key : ROOT,
        });
      }

      await Promise.all(newCards.map((card) => this.createNode(card)));
      // Storage and facts only. The creating command runs the creation query
      // and its side effects.
      await this.project.addCreatedCards(newCards, this.fullTemplateName);
      return newCardKeys;
    } catch (error) {
      this.logger.error({ error });
      throw error;
    }
  }

  /**
   * Return all attachment in the template.
   * @returns all attachments in the template.
   */
  public attachments(): CardAttachment[] {
    return this.project.templateAttachments(this.fullTemplateName);
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
   * The template's full resource name, e.g. 'decision/templates/decision'.
   *
   * This is the name the template's cards are stored under.
   */
  public get fullName(): string {
    return this.fullTemplateName;
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

    return this.project.templateCards(this.fullTemplateName);
  }

  /**
   * Returns how many cards the template has.
   * @returns the number of cards in the template.
   */
  public cardCount(): number {
    return this.project.templateCardCount(this.fullTemplateName);
  }

  /**
   * Creates cards from a template. If parent card is specified, then cards are created to underneath a parent.
   * @param parentCard parent card
   * @returns array of created card keys
   */

  // Creates card(s) as project cards from template.
  public async createCards(parentCard?: Card): Promise<Card[]> {
    const cards = this.cards();
    try {
      if (cards.length === 0) {
        throw new Error(
          `No cards in template '${this.templateName}'. Please add template cards with 'add' command first.`,
        );
      }
      if (parentCard) {
        this.project.findCard(parentCard.key);
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to create cards');
      throw error;
    }

    const createdPaths: string[] = [];
    try {
      const cardKeyMap = await this.buildCardKeyMap(cards);
      const rootCardRanks = this.rootCardRanks(cards, parentCard);

      // Copies of the template's cards, moved to their destination positions
      // before anything is written: a card's folder is decided by where it
      // sits, so the whole batch has to be placed before any of it is created.
      const instantiated = cards.map((originalCard) => {
        const card: Card = structuredClone(originalCard);
        this.remapCardPosition(card, cardKeyMap, parentCard);
        return card;
      });
      this.assignInstantiatedPaths(
        instantiated,
        parentCard
          ? join(parentCard.path, 'c')
          : this.project.paths.cardRootFolder,
      );
      createdPaths.push(...instantiated.map((card) => card.path));

      // Process all cards in parallel
      const results = await Promise.allSettled(
        instantiated.map(async (card) => {
          const processedCard = await this.processAttachments(
            await this.processMetadata(card, rootCardRanks, cardKeyMap),
          );
          // The creation primitive also makes the card folder;
          // processAttachments only creates one when the card has attachments.
          await this.createNode(processedCard);
          return processedCard;
        }),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) {
        throw failed.reason;
      }
      const processedCards = results.map(
        (result) => (result as PromiseFulfilledResult<Card>).value,
      );
      // Storage and facts only, inside this try so a failure here is still
      // compensated. The creating command runs the creation query and its
      // side effects.
      await this.project.addCreatedCards(processedCards, 'project');
      return processedCards;
    } catch (error) {
      try {
        await this.removeCards(createdPaths);
      } catch (cleanupError) {
        this.logger.error(
          { error: cleanupError },
          'Failed to remove partially created cards',
        );
      }
      this.logger.error({ error }, 'Failed to create cards');
      throw error;
    }
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
    return this.project.templateCards(this.fullTemplateName);
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
