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

import { join } from 'node:path';
import { copyFile, mkdir, rm } from 'node:fs/promises';

import { DefaultContent } from './create-defaults.js';
import { FolderResource } from './folder-resource.js';
import {
  isInitialTransition,
  resourceNameToString,
} from '../utils/resource-utils.js';
import { sortCards } from '../utils/card-utils.js';
import { writeJsonFileIfAbsent } from '../utils/json.js';
import { getChildLogger } from '../utils/log-utils.js';
import { pathExists } from '../utils/file-utils.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  sortItems,
} from '../utils/lexorank.js';
import { isPredefinedField, ROOT } from '../utils/constants.js';

import type { Card, CardAttachment } from '../interfaces/project-interfaces.js';
import type { CardTree } from '../containers/project/card-tree.js';
import type { Project } from '../containers/project.js';
import type { ResourceName } from '../utils/resource-utils.js';
import type {
  TemplateConfiguration,
  TemplateMetadata,
} from '../interfaces/resource-interfaces.js';

/**
 * Template resource class.
 *
 * A template is a folder resource plus a card tree: the cards under its 'c'
 * folder, which the project instantiates into project cards.
 */
export class TemplateResource extends FolderResource<TemplateMetadata, never> {
  private cardsSchema = super.contentSchemaContent('cardBaseSchema');

  private get templateLogger() {
    return getChildLogger({ module: 'template' });
  }

  /**
   * Creates an instance of TemplateResource
   * @param project Project to use
   * @param name Resource name
   */
  constructor(project: Project, name: ResourceName) {
    super(project, name, 'templates');

    this.contentSchemaId = 'templateSchema';
    this.contentSchema = super.contentSchemaContent(this.contentSchemaId);
  }

  /**
   * The template's full resource name, e.g. 'decision/templates/decision'.
   *
   * This is the name its card tree is known by.
   */
  public get fullName(): string {
    return resourceNameToString(this.resourceName);
  }

  /**
   * The tree holding the template's cards.
   *
   * Owned by the project, not by this instance: a resource instance is dropped
   * and rebuilt whenever the resource cache is refreshed, and the cards have
   * to outlive that.
   */
  public get cardTree(): CardTree {
    return this.project.templateTree(this.fullName, this.templateCardsFolder());
  }

  /**
   * Returns path to the 'templates/<name>' folder.
   */
  public templateFolder(): string {
    return this.internalFolder;
  }

  /**
   * Returns path to the 'templates/<name>/c' folder.
   */
  public templateCardsFolder(): string {
    return join(this.internalFolder, 'c');
  }

  /**
   * Whether the template's card folder exists on disk.
   */
  public isCreated(): boolean {
    return pathExists(this.templateCardsFolder());
  }

  /**
   * Every card in the template.
   */
  public templateCards(): Card[] {
    return this.cardTree.cards();
  }

  /**
   * How many cards the template has.
   */
  public cardCount(): number {
    return this.cardTree.count;
  }

  /**
   * Every attachment of every card in the template.
   */
  public templateAttachments(): CardAttachment[] {
    return this.cardTree.attachments();
  }

  /**
   * Whether the template holds a card.
   * @param cardKey Card key to check.
   */
  public hasTemplateCard(cardKey: string): boolean {
    return this.cardTree.has(cardKey);
  }

  /**
   * One card of the template.
   * @param cardKey Card key to read.
   * @throws if the template does not hold the card
   */
  public templateCard(cardKey: string): Card {
    if (!this.cardTree.has(cardKey)) {
      throw new Error(`Card '${cardKey}' is not part of template`);
    }
    return this.cardTree.card(cardKey);
  }

  /**
   * The folder holding a template card's attachments.
   * @param cardKey Card key to locate.
   * @throws if the template does not hold the card
   */
  public cardAttachmentFolder(cardKey: string): string {
    return this.cardTree.attachmentFolderOf(cardKey);
  }

  /**
   * The folder a template card's own files live in.
   * @param cardKey Card key to locate.
   * @throws if the template does not hold the card
   */
  public cardFolder(cardKey: string): string {
    this.templateCard(cardKey);
    return this.cardTree.pathOf(cardKey);
  }

  /**
   * Adds a new card to the template.
   * @param cardTypeName card type
   * @param parentCard parent card; optional - if missing will create a
   *   top-level card
   * @returns the new card's key
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
   * @param parentCard parent card; optional - if missing will create top-level
   *   cards
   * @returns card key IDs of the added cards, in rank order
   */
  public async addCards(
    cardTypeName: string,
    count: number,
    parentCard?: Card,
  ): Promise<string[]> {
    try {
      if (!this.isCreated()) {
        throw new Error(`Template '${this.fullName}' does not exist`);
      }
      const cardType = this.project.resources
        .byType(cardTypeName, 'cardTypes')
        .show();

      if (parentCard && !this.hasTemplateCard(parentCard.key)) {
        throw new Error(
          `Card '${parentCard.key}' does not exist in template '${this.fullName}'`,
        );
      }

      const tree = this.cardTree;
      const parentKey = parentCard ? parentCard.key : ROOT;

      // Keys and ranks are allocated here, in one pass, before anything is
      // written. Allocating them per card inside a concurrent fan-out gave
      // every card the same sibling snapshot — and therefore the same rank.
      const newCardKeys = this.project.newCardKeys(count);

      const siblings = parentCard
        ? this.project.cardKeysToCards(parentCard.children)
        : this.templateCards();

      const newCards: Card[] = [];
      for (const newCardKey of newCardKeys) {
        // Each new card ranks after the siblings and after the cards
        // allocated before it in this batch.
        newCards.push({
          key: newCardKey,
          path: tree.pathFor(parentKey, newCardKey),
          metadata: DefaultContent.card(cardType, [...siblings, ...newCards]),
          children: [],
          attachments: [],
          content: '',
          parent: parentKey,
        });
      }

      await Promise.all(newCards.map((card) => tree.createNode(card)));
      // Storage and facts only. The creating command runs the creation query
      // and its side effects.
      await this.project.addCreatedCards(newCards, this.fullName);
      return newCardKeys;
    } catch (error) {
      this.templateLogger.error({ error });
      throw error;
    }
  }

  /**
   * Creates project cards from the template. If a parent card is given, the
   * cards are created underneath it.
   * @param parentCard parent card
   * @returns the created cards
   */
  public async createCards(parentCard?: Card): Promise<Card[]> {
    const cards = this.templateCards();
    try {
      if (cards.length === 0) {
        throw new Error(
          `No cards in template '${this.fullName}'. Please add template cards with 'add' command first.`,
        );
      }
      if (parentCard) {
        this.project.findCard(parentCard.key);
      }
    } catch (error) {
      this.templateLogger.error({ error }, 'Failed to create cards');
      throw error;
    }

    // Folders this operation has begun writing, collected so that a failure
    // part-way through the fan-out can be compensated. Recorded before any
    // filesystem call touches the folder.
    const createdPaths: string[] = [];
    try {
      const cardKeyMap = this.buildCardKeyMap(cards);
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

      // The instantiated cards are project cards, so they are created in the
      // project's tree - not in the template's, which for a module template
      // refuses writes.
      const destination = this.project.containerTree('project');

      // Process all cards in parallel
      // allSettled, not all: compensation may only run once every branch has
      // stopped touching the filesystem, or it races the writes it is undoing.
      const results = await Promise.allSettled(
        instantiated.map(async (card) => {
          // One card object all the way through: what is written to disk,
          // what is returned and what is cached must be the same thing.
          // Chained, not run in parallel: processAttachments rewrites the
          // content and the attachment list of the object it is handed.
          const processedCard = await this.processAttachments(
            await this.processMetadata(card, rootCardRanks, cardKeyMap),
          );

          // Through the creation primitive, which also makes the card folder;
          // processAttachments only creates one when the card has attachments.
          await destination.createNode(processedCard);
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
      // Storage and facts only, and inside this try so a failure here is
      // still compensated. The creating command runs the creation query and
      // its side effects.
      await this.project.addCreatedCards(processedCards, 'project');
      return processedCards;
    } catch (error) {
      // Compensation must not replace the failure that triggered it.
      try {
        await this.removeCards(createdPaths);
      } catch (cleanupError) {
        this.templateLogger.error(
          { error: cleanupError },
          'Failed to remove partially created cards',
        );
      }
      this.templateLogger.error({ error }, 'Failed to create cards');
      throw error;
    }
  }

  // Fresh keys for the instantiated copies, keyed by template card key.
  private buildCardKeyMap(cards: Card[]): Map<string, string> {
    const newCardIds = this.project.newCardKeys(cards.length);
    const cardsByKey = new Map<string, string>();
    cards.forEach((card, index) => {
      cardsByKey.set(card.key, newCardIds.at(index) || '');
    });
    return cardsByKey;
  }

  // Allocates a rank block for the template's root cards, placed after the
  // last future sibling at the destination.
  //
  // Pure by contract: the ranks are returned keyed by template card key and
  // applied to the instantiated copies in processMetadata, so that nothing
  // here can write into the template's own cards.
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
      : this.project.showProjectCards();

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
  // its children's keys, and its parent - either the card the template is
  // instantiated under, or the instantiated copy of its template parent.
  //
  // Paths are not touched here. A card's folder follows from where it sits in
  // the destination tree (see assignInstantiatedPaths), which is the same rule
  // the tree itself uses to derive them.
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

  // Copies the template card's attachments to the instantiated card under
  // card-key-prefixed names, and returns the card with its content references
  // and its attachments[] pointing at the copies. Both are part of the same
  // returned object: the caller writes and caches exactly what it gets back.
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

  // Deletes the card folders createCards had begun writing.
  // Helper for createCards; not intended for any other use.
  //
  // Takes paths rather than card keys: this runs before the cards enter the
  // project's tree, so there is nothing to look them up by.
  private async removeCards(cardPaths: string[]) {
    await Promise.all(
      cardPaths.map((path) => rm(path, { force: true, recursive: true })),
    );
  }

  /**
   * Sets new metadata into the template object.
   * @param newContent metadata content for the template.
   */
  public async create(newContent?: TemplateMetadata) {
    if (!newContent) {
      newContent = DefaultContent.template(this.fullName);
    } else {
      await this.validate(newContent);
    }

    return super.create(newContent);
  }

  /**
   * Deletes file and folder that this resource is based on.
   * Also drops the template's cards.
   */
  public async delete() {
    this.project.removeTemplateTree(this.fullName);
    return super.delete();
  }

  /**
   * Renames the template, and moves its card tree with it.
   *
   * A template card is known by its template's name and lives under its
   * template's folder, and renaming the template changes both. Without this,
   * every card of the renamed template stays under the old name and the
   * template reads as empty for the rest of the session.
   * @param newIdentifier New identifier for the template.
   */
  public async rename(newIdentifier: string) {
    const oldName = this.fullName;
    await super.rename(newIdentifier);
    // Same cards, new name, new folder. No reload, because their paths are
    // derived from the folder.
    this.project.renameTemplateTree(
      oldName,
      this.fullName,
      this.templateCardsFolder(),
    );
  }

  /**
   * Shows metadata of the resource.
   * @returns template metadata.
   */
  public show(): TemplateConfiguration {
    const templateMetadata = super.show();

    return {
      name: this.fullName,
      category: templateMetadata.category,
      displayName: templateMetadata.displayName,
      description: templateMetadata.description,
      path: this.fileName,
      numberOfCards: this.cardCount(),
    };
  }

  /**
   * List where template is used.
   * Always returns card key references first, then calculation references.
   *
   * @param cards Optional. Check these cards for usage of this resource. If undefined, will check all cards.
   * @returns array of card keys, and calculation filenames that refer this resource.
   */
  public async usage(cards?: Card[]): Promise<string[]> {
    const allCards = cards ?? super.cards();
    const [relevantCards, calculations] = await Promise.all([
      super.usage(allCards),
      super.calculations(),
    ]);
    return [...relevantCards.sort(sortCards), ...calculations];
  }

  /**
   * Create the template's cards folder.
   */
  public async write() {
    await super.write();

    // The template's cards are rooted at its 'c' folder. Registered on every
    // write, so a card created into a template that has just been created -
    // or just renamed - has somewhere to be derived from.
    this.project.registerTemplateCardsFolder(
      this.fullName,
      this.templateCardsFolder(),
    );

    // Create folder for cards and put proper content schema file there
    const schemaContentFile = join(this.templateCardsFolder(), '.schema');
    await mkdir(this.templateCardsFolder(), { recursive: true });
    await writeJsonFileIfAbsent(schemaContentFile, this.cardsSchema);
  }
}
