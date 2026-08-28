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
import { EMPTY_RANK, sortItems } from '../utils/lexorank.js';
import { isPredefinedField, ROOT } from '../utils/constants.js';

import type {
  Card,
  CardAttachment,
  CardMetadata,
} from '../interfaces/project-interfaces.js';
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
      const newCardKeys = this.project.cardKeyRegistry.allocate(count);
      const ranks = tree.rankBlock(parentKey, count);

      const newCards: Card[] = newCardKeys.map((newCardKey, index) => ({
        key: newCardKey,
        path: tree.pathFor(parentKey, newCardKey),
        metadata: { ...DefaultContent.card(cardType), rank: ranks[index] },
        children: [],
        attachments: [],
        content: '',
        parent: parentKey,
      }));

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
    // The template's cards, read once, through the tree. Nothing on disk is
    // copied: an instantiated card is built in memory and written once.
    const templateCards = this.templateCards();
    try {
      if (templateCards.length === 0) {
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
      const cardKeyMap = this.buildCardKeyMap(templateCards);
      const rootCardRanks = this.rootCardRanks(templateCards, parentCard);

      // The instantiated cards are project cards, so they are created in the
      // project's tree - not in the template's, which for a module template
      // refuses writes.
      const destination = this.project.containerTree('project');

      // Built, not copied - see instantiate(). Positions are settled for the
      // whole batch before anything is written: a card's folder is decided by
      // where it sits, so the batch has to be placed before any of it exists.
      const instantiated = templateCards.map((templateCard) =>
        this.instantiate(templateCard, cardKeyMap, rootCardRanks, parentCard),
      );
      this.assignInstantiatedPaths(
        instantiated,
        destination.childFolderOf(parentCard?.key ?? ROOT),
      );
      createdPaths.push(...instantiated.map((card) => card.path));

      // Process all cards in parallel
      // allSettled, not all: compensation may only run once every branch has
      // stopped touching the filesystem, or it races the writes it is undoing.
      const results = await Promise.allSettled(
        instantiated.map(async (card, index) => {
          // One card object all the way through: what is written to disk,
          // what is returned and what is cached must be the same thing.
          const createdCard = await this.copyAttachments(
            card,
            templateCards[index].attachments,
          );

          // Through the creation primitive, which also makes the card folder;
          // copyAttachments only creates one when the card has attachments.
          await destination.createNode(createdCard);
          return createdCard;
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
    const newCardIds = this.project.cardKeyRegistry.allocate(cards.length);
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
    const rootCards = sortItems(
      cards.filter((card) => card.parent === ROOT),
      (card) => card.metadata?.rank || '',
    );
    // The destination tree allocates the block: it is the one that knows what
    // is already ranked where the cards are going.
    const ranks = this.project
      .containerTree('project')
      .rankBlock(parentCard ? parentCard.key : ROOT, rootCards.length);
    return new Map(rootCards.map((card, index) => [card.key, ranks[index]]));
  }

  // One instantiated card, built field by field from its template card.
  //
  // Instantiation is a create, not a copy. Nothing is cloned and nothing is
  // spread in, so no field arrives by accident: every field of an
  // instantiated card is either computed by the destination, carried from the
  // template card, or set by this operation, and a field that is none of
  // those is not on the card. That is what the field-transfer list here and
  // in instantiatedMetadata is - the specification of what instantiation
  // means, in the one place it is decided.
  //
  // Paths are not set here. A card's folder follows from where it sits in the
  // destination tree (see assignInstantiatedPaths), which is the same rule the
  // tree itself derives them by, so the whole batch has to be positioned
  // first.
  private instantiate(
    templateCard: Card,
    cardKeyMap: Map<string, string>,
    rootCardRanks: Map<string, string>,
    parentCard?: Card,
  ): Card {
    const templateParentKey = templateCard.parent;
    const isTemplateRootCard = !templateParentKey || templateParentKey === ROOT;

    return {
      // --- computed by the destination ---
      key: cardKeyMap.get(templateCard.key) ?? templateCard.key,
      // A root card of the template hangs off whatever the template is
      // instantiated under; anything else hangs off its own template
      // parent's instantiated copy.
      parent: isTemplateRootCard
        ? (parentCard?.key ?? ROOT)
        : (cardKeyMap.get(templateParentKey) ?? parentCard?.key ?? ROOT),
      children: templateCard.children.map(
        (childKey) => cardKeyMap.get(childKey) ?? childKey,
      ),
      path: '',

      // --- carried from the template card ---
      content: templateCard.content,

      // --- set by this operation ---
      // The attachment copies, and the content references to them, are put on
      // the card by copyAttachments.
      attachments: [],

      metadata: templateCard.metadata
        ? this.instantiatedMetadata(templateCard.metadata, {
            templateCardKey: templateCard.key,
            rank: rootCardRanks.get(templateCard.key),
          })
        : undefined,
    };
  }

  // The metadata of an instantiated card: the field-transfer list, spelled
  // out. See instantiate() for why it is spelled out.
  private instantiatedMetadata(
    templateMetadata: CardMetadata,
    computed: { templateCardKey: string; rank: string | undefined },
  ): CardMetadata {
    const cardType = this.project.resources
      .byType(templateMetadata.cardType, 'cardTypes')
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

    const metadata: CardMetadata = {
      // --- computed by the destination ---
      // A root card of the template takes a rank out of the destination's
      // block. A nested one keeps the rank it had, which still orders it
      // correctly: its siblings came with it and nothing else is under its
      // parent.
      rank: computed.rank ?? templateMetadata.rank ?? EMPTY_RANK,
      workflowState: initialWorkflowState.toState,
      createdAt: new Date().toISOString(),
      // Empty, deliberately. A template card's links point at template card
      // keys, so a carried-over link points at a card outside the
      // instantiated set - broken by construction. 'lastUpdated' is stamped
      // by the write itself and 'lastTransitioned' has not happened, so
      // neither is set here.
      links: [],

      // --- carried from the template card ---
      cardType: cardType.name,
      title: templateMetadata.title,

      // --- set by this operation ---
      templateCardKey: computed.templateCardKey,
    };

    if (templateMetadata.labels) {
      metadata.labels = [...templateMetadata.labels];
    }
    // Carried, unlike 'links': an external link names an item in another
    // system, which instantiation does not invalidate.
    if (templateMetadata.externalLinks) {
      metadata.externalLinks = templateMetadata.externalLinks.map((link) => ({
        ...link,
      }));
    }

    // Authored custom-field values. A null on a template card is its 'no
    // value' marker rather than content, so that slot is left absent.
    for (const [key, value] of Object.entries(templateMetadata)) {
      if (!isPredefinedField(key) && value !== null) {
        metadata[key] = value;
      }
    }

    return metadata;
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

  // Copies a template card's attachments onto the instantiated card under
  // card-key-prefixed names, and returns the card with its content references
  // and its attachments[] pointing at the copies. Both are part of the same
  // returned object: the caller writes and caches exactly what it gets back.
  //
  // The attachment files are the one thing instantiation does copy on disk -
  // they are opaque bytes, and there is nothing to construct them from.
  private async copyAttachments(
    card: Card,
    templateAttachments: CardAttachment[],
  ): Promise<Card> {
    if (templateAttachments.length === 0) return card;

    const attachmentsFolder = join(card.path, 'a');
    await mkdir(attachmentsFolder, { recursive: true });

    let content = card.content;
    const attachments: CardAttachment[] = templateAttachments.map(
      (attachment) => {
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
          card: card.key,
          path: attachmentsFolder,
          fileName: attachmentUniqueName,
          mimeType: attachment.mimeType,
        };
      },
    );

    await Promise.all(
      templateAttachments.map((attachment, index) =>
        copyFile(
          join(attachment.path, attachment.fileName),
          join(attachmentsFolder, attachments[index].fileName),
        ),
      ),
    );
    return { ...card, content, attachments };
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

    // The template's cards are rooted at its 'c' folder. Its tree is asked for
    // on every write, so a card created into a template that has just been
    // created - or just renamed - has a tree to go into.
    this.project.templateTree(this.fullName, this.templateCardsFolder());

    // Create folder for cards and put proper content schema file there
    const schemaContentFile = join(this.templateCardsFolder(), '.schema');
    await mkdir(this.templateCardsFolder(), { recursive: true });
    await writeJsonFileIfAbsent(schemaContentFile, this.cardsSchema);
  }
}
