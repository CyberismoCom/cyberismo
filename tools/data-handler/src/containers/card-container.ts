/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// node
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

import { CardCache } from './project/card-cache.js';
import { CardNotFoundError } from '../exceptions/index.js';
import { cardPathParts } from '../utils/card-utils.js';
import { deleteDir } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { writeJsonFile } from '../utils/json.js';

import type {
  CardAttachment,
  Card,
  CardMetadata,
  CardNode,
} from '../interfaces/project-interfaces.js';

import { isPredefinedField, ROOT } from '../utils/constants.js';

/**
 * Card container base class. Used for both Project and Template.
 * Contains common card-related functionality.
 */
export class CardContainer {
  public basePath: string;
  protected cardCache: CardCache;
  protected prefix: string;

  protected static get logger() {
    return getChildLogger({ module: 'CardContainer' });
  }

  static cardContentFile = 'index.adoc';
  static cardMetadataFile = 'index.json';
  static projectConfigFileName = 'cardsConfig.json';
  static schemaContentFile = '.schema';

  constructor(path: string, prefix: string) {
    this.basePath = path;
    this.prefix = prefix;
    this.cardCache = new CardCache(this.prefix);
  }

  // Identity and tree position, with the cache-internal 'location' dropped.
  // The metadata is shared with the cache, so a node is a read-only view: its
  // callers are audited (see the branch's commit log) and none of them writes
  // to what they get back. Callers that modify metadata use cards() or
  // findCard(), which hand out a copy.
  private static nodeView(card: Card): CardNode {
    return {
      key: card.key,
      path: card.path,
      children: card.children,
      metadata: card.metadata,
      parent: card.parent,
    };
  }

  // The fully hydrated card: identity, tree position, a copy of the metadata,
  // and the content and attachment listing shared with the cache.
  private static cardView(card: Card): Card {
    return {
      ...CardContainer.nodeView(card),
      metadata: structuredClone(card.metadata),
      content: card.content,
      attachments: card.attachments,
    };
  }

  /**
   * Determines the container from a given path.
   * @param path The filesystem path to analyze
   * @returns Location string: 'project' for project cards, template name for template cards
   */
  protected determineContainer(path: string): string {
    return cardPathParts(this.prefix, path).template || 'project';
  }

  /**
   * Populates the card cache with all cards from all locations.
   */
  protected async populateCardsCache(): Promise<void> {}

  /**
   * Populates template cards into the cache.
   */
  protected async populateTemplateCards(): Promise<void> {}

  /**
   * Lists all attachments from the container.
   * @param path Path where attachments should be collected.
   * @returns attachments from the container.
   */
  protected attachments(path: string): CardAttachment[] {
    const attachments: CardAttachment[] = [];

    const targetLocation = this.determineContainer(path);
    const cards = this.cardCache.cardsAtLocation(targetLocation);
    cards
      .filter((card) => card.attachments.length > 0)
      .forEach((item) => attachments.push(...item.attachments));
    return attachments;
  }

  /**
   * Shows all cards from the container, fully hydrated.
   * @param path Path where cards should be listed.
   * @returns all cards from the container
   */
  protected cards(path: string): Card[] {
    return this.cachedCards(path).map(CardContainer.cardView);
  }

  /**
   * Metadata-level view of every card in the container: no content, no
   * attachment listing.
   * @param path Path where cards should be listed.
   * @returns nodes of all cards from the container
   */
  protected cardNodes(path: string): CardNode[] {
    return this.cachedCards(path).map(CardContainer.nodeView);
  }

  /**
   * Card keys of every card in the container.
   * @param path Path where cards should be listed.
   * @returns keys of all cards from the container
   */
  protected cardKeys(path: string): string[] {
    return this.cachedCards(path).map((card) => card.key);
  }

  /**
   * Metadata-level view of one card: no content, no attachment listing.
   * @param cardKey Card key to find
   * @throws if card does not exist in the container
   */
  protected cardNode(cardKey: string): CardNode {
    const cachedCard = this.cardCache.getCard(cardKey);
    if (!cachedCard) {
      throw new CardNotFoundError(cardKey);
    }
    return CardContainer.nodeView(cachedCard);
  }

  /**
   * Content of one card.
   * @param cardKey Card key to read
   * @returns the card's content, or undefined if it has none
   * @throws if card does not exist in the container
   */
  protected cardContent(cardKey: string): string | undefined {
    const cachedCard = this.cardCache.getCard(cardKey);
    if (!cachedCard) {
      throw new CardNotFoundError(cardKey);
    }
    return cachedCard.content;
  }

  /**
   * Attachment listing of one card.
   * @param cardKey Card key to read
   * @returns the card's attachments
   * @throws if card does not exist in the container
   */
  protected cardAttachments(cardKey: string): CardAttachment[] {
    const cachedCard = this.cardCache.getCard(cardKey);
    if (!cachedCard) {
      throw new CardNotFoundError(cardKey);
    }
    return cachedCard.attachments;
  }

  /**
   * Finds a specific card, fully hydrated.
   * @param cardKey Card key to find
   * @throws if card does not exist in the container
   */
  protected findCard(cardKey: string): Card {
    const cachedCard = this.cardCache.getCard(cardKey);
    if (cachedCard) {
      return CardContainer.cardView(cachedCard);
    }
    throw new CardNotFoundError(cardKey);
  }

  // The cached cards belonging to the container the path points at.
  private cachedCards(path: string): Card[] {
    if (!this.cardCache.isPopulated) {
      throw new Error('Cards cache is not populated!');
    }

    return this.cardCache.cardsAtLocation(this.determineContainer(path));
  }

  /**
   * Removes a card. If card has children, they are removed as well.
   * @param cardKey Card key to remove.
   * @returns true, if card was removed; false otherwise
   */
  protected async removeCard(cardKey: string): Promise<boolean> {
    const card = this.cardCache.getCard(cardKey);
    if (card) {
      // Children must removed first. The list is a snapshot: removing a child
      // replaces the parent's list in the adjacency index rather than mutating
      // the array this loop walks.
      const children = this.cardCache.childrenOf(cardKey);
      for (const child of children) {
        await this.removeCard(child);
      }
      await deleteDir(card.path);
      return this.cardCache.deleteCard(cardKey);
    }
    return false;
  }

  /**
   * Persists the whole card.
   * @param card Card to persist
   */
  protected async saveCard(card: Card) {
    await this.saveCardContent(card);
    await this.saveCardMetadata(card);
  }

  /**
   * Persists card content.
   * @param card Card to persist.
   * @returns true if card was updated; false otherwise.
   */
  protected async saveCardContent(card: Card): Promise<boolean> {
    if (card.content != null) {
      const contentFile = join(card.path, CardContainer.cardContentFile);
      await writeFile(contentFile, card.content);
      return this.cardCache.updateCardContent(card.key, card.content);
    }
    return false;
  }

  /**
   * Persists card metadata.
   * @param card Card to persist
   * @returns true if the cache was updated; false if the card has no metadata.
   * @throws if the metadata file cannot be written.
   */
  protected async saveCardMetadata(card: Card): Promise<boolean> {
    if (card.metadata != null) {
      const metadataFile = join(card.path, CardContainer.cardMetadataFile);
      card.metadata!.lastUpdated = new Date().toISOString();

      // Cache the same object that was written, so cache and disk agree.
      const sanitizedMetadata = CardContainer.sanitizeMetadata(card);
      await writeJsonFile(metadataFile, sanitizedMetadata);
      return this.cardCache.updateCardMetadata(card.key, sanitizedMetadata);
    }
    return false;
  }

  /**
   * Removes non-metadata fields that should not be persisted.
   *
   * @param card The card whose metadata is sanitized
   * @returns Clean metadata object with only valid metadata fields
   */
  private static sanitizeMetadata(card: Card): CardMetadata {
    const sanitized: Record<string, unknown> = {};

    if (card.metadata) {
      for (const [key, value] of Object.entries(card.metadata)) {
        // JSON.stringify drops undefined, so drop it here too: the cache must
        // not retain keys the file lacks.
        if (value === undefined) {
          continue;
        }
        // Keys are not filtered out if they are: predefined, or field types
        if (isPredefinedField(key) || key.includes('/')) {
          sanitized[key] = value;
        } else {
          this.logger.warn(
            `Card ${card.key} had extra metadata key ${key} with value ${value}. Key was removed`,
          );
        }
        // Everything else is filtered out
      }
    }

    return sanitized as CardMetadata;
  }

  /*
   * Show root cards from a given path.
   * @param path The path to get cards from
   * @returns an array of root-level cards (each with their children populated).
   */
  protected showCards(path: string): Card[] {
    const container = this.determineContainer(path);
    const rootCards: Card[] = [];
    const relevantCards = this.cardCache.cardsAtLocation(container);

    relevantCards.forEach((card) => {
      // A card is a root of this container if it says so, or if its parent is
      // not a card of this container. The parent lookup goes through the cache
      // rather than scanning the container's cards, which made this O(k^2).
      if (
        card.parent === ROOT ||
        !card.parent ||
        this.cardCache.getCard(card.parent)?.location !== container
      ) {
        const cardWithChildren: Card = {
          ...card,
          children: card.children,
        };
        rootCards.push(cardWithChildren);
      }
    });

    return rootCards;
  }

  /**
   * Checks if container has the specified card.
   * @param cardKey Card key to check
   * @return true, if card is in the container
   */
  public hasCard(cardKey: string): boolean {
    return this.cardCache.hasCard(cardKey);
  }

  /**
   * Checks if container has the specified project card.
   * @param cardKey Card key to check
   * @return true, if card is in the container
   */
  public hasProjectCard(cardKey: string): boolean {
    const cachedCard = this.cardCache.getCard(cardKey);
    return cachedCard ? cachedCard.location === 'project' : false;
  }

  /**
   * Checks if container has the specified template card.
   * @param cardKey Card key to check
   * @return true, if card is in the container
   */
  public hasTemplateCard(cardKey: string): boolean {
    const cachedCard = this.cardCache.getCard(cardKey);
    return cachedCard ? cachedCard.location !== 'project' : false;
  }
}
