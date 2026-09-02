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
   */
  public get fullName(): string {
    return resourceNameToString(this.resourceName);
  }

  /**
   * The tree holding the template's cards.
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

      if (parentCard && !this.cardTree.has(parentCard.key)) {
        throw new Error(
          `Card '${parentCard.key}' does not exist in template '${this.fullName}'`,
        );
      }

      const tree = this.cardTree;
      const parentKey = parentCard ? parentCard.key : ROOT;

      // Keys and ranks are allocated in one pass, before anything is written.
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
    const templateCards = this.cardTree.cards();
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

    const createdPaths: string[] = [];
    try {
      // Into the project's tree: a module template's own tree refuses writes.
      const destination = this.project.containerTree('project');

      const cardKeyMap = this.buildCardKeyMap(templateCards);
      const rootCardRanks = this.rootCardRanks(
        templateCards,
        destination,
        parentCard,
      );

      // Positions are settled for the whole batch before anything is written:
      // a card's folder is decided by where it sits.
      const instantiated = templateCards.map((templateCard) =>
        this.instantiate(templateCard, cardKeyMap, rootCardRanks, parentCard),
      );
      this.assignInstantiatedPaths(
        instantiated,
        destination.childFolderOf(parentCard?.key ?? ROOT),
      );
      createdPaths.push(...instantiated.map((card) => card.path));

      const results = await Promise.allSettled(
        instantiated.map(async (card, index) => {
          const createdCard = await this.copyAttachments(
            card,
            templateCards[index].attachments,
          );
          // The creation primitive also makes the card folder;
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
      // Inside this try so a failure here is still compensated.
      await this.project.addCreatedCards(processedCards, 'project');
      return processedCards;
    } catch (error) {
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
  private rootCardRanks(
    cards: Card[],
    destination: CardTree,
    parentCard: Card | undefined,
  ): Map<string, string> {
    const rootCards = sortItems(
      cards.filter((card) => card.parent === ROOT),
      (card) => card.metadata?.rank || '',
    );
    const ranks = destination.rankBlock(
      parentCard ? parentCard.key : ROOT,
      rootCards.length,
    );
    return new Map(rootCards.map((card, index) => [card.key, ranks[index]]));
  }

  // One instantiated card, built field by field. Paths are assigned for the
  // whole batch afterwards (assignInstantiatedPaths).
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

  // The metadata of an instantiated card, field by field. See instantiate().
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
      // block; a nested one keeps its own, which still orders it correctly
      // among the siblings that came with it.
      rank: computed.rank ?? templateMetadata.rank ?? EMPTY_RANK,
      workflowState: initialWorkflowState.toState,
      createdAt: new Date().toISOString(),
      // links name template card keys, so they are not carried.
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

  // Copies a template card's attachments under card-key-prefixed names, and
  // returns the card with its content references and its attachments[]
  // pointing at the copies.
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
   * @param newIdentifier New identifier for the template.
   */
  public async rename(newIdentifier: string) {
    const oldName = this.fullName;
    await super.rename(newIdentifier);
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
      numberOfCards: this.cardTree.count,
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

    // Create folder for cards and put proper content schema file there
    const schemaContentFile = join(this.templateCardsFolder(), '.schema');
    await mkdir(this.templateCardsFolder(), { recursive: true });
    await writeJsonFileIfAbsent(schemaContentFile, this.cardsSchema);
  }
}
