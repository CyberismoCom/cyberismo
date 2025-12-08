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
import { cardPathParts } from '../utils/card-utils.js';
import { deleteDir } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { writeJsonFile } from '../utils/json.js';

import type {
  CardAttachment,
  Card,
  CardMetadata,
  FetchCardDetails,
} from '../interfaces/project-interfaces.js';

import asciidoctor from '@asciidoctor/core';

import { isPredefinedField, ROOT } from '../utils/constants.js';

/**
 * Card container base class. Used for both Project and Template.
 * Contains common card-related functionality.
 */
export class CardContainer {
  public basePath: string;
  protected cardCache: CardCache;
  protected containerName: string;
  protected prefix: string;

  protected static get logger() {
    return getChildLogger({ module: 'CardContainer' });
  }

  static cardContentFile = 'index.adoc';
  static cardMetadataFile = 'index.json';
  static projectConfigFileName = 'cardsConfig.json';
  static schemaContentFile = '.schema';

  constructor(path: string, prefix: string, name: string) {
    this.basePath = path;
    this.containerName = name;
    this.prefix = prefix;
    this.cardCache = new CardCache(this.prefix);
  }

  // Filters one card to only include the details requested.
  private filterCardDetails(
    card: Card,
    details: FetchCardDetails = {
      attachments: true,
      children: true,
      content: true,
      metadata: true,
      parent: true,
    },
  ): Card {
    const filteredCard: Card = {
      key: card.key,
      path: card.path,
      children: details.children ? card.children : [],
      attachments: details.attachments ? card.attachments : [],
    };

    if (details.content) {
      filteredCard.content = card.content;
    }
    if (details.metadata) {
      filteredCard.metadata = structuredClone(card.metadata);
    }
    if (details.parent) {
      filteredCard.parent = card.parent;
    }
    if (details.calculations) {
      filteredCard.calculations = card.calculations;
    }

    return filteredCard;
  }

  // Filters cards to only include the details requested.
  private filterCardsDetails(
    cards: Card[],
    details?: FetchCardDetails,
  ): Card[] {
    return cards.map((card) => {
      return this.filterCardDetails(card, details);
    });
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
    const cards = [...this.cardCache.getCards()];
    const filteredCards = cards.filter((card) => {
      if (card.attachments.length === 0) {
        return false;
      }
      return card.location === targetLocation;
    });

    filteredCards.forEach((item) => attachments.push(...item.attachments));
    return attachments;
  }

  /**
   * Shows all cards from the container with the given details (by default all of them).
   * @param path Path where cards should be listed.
   * @param details Which details of the card should be included
   * @returns all cards from the container
   */
  protected cards(path: string, details?: FetchCardDetails): Card[] {
    if (!this.cardCache.isPopulated) {
      throw new Error('Cards cache is not populated!');
    }

    const targetLocation = this.determineContainer(path);
    const relevantCards = this.cardCache
      .getCards()
      .filter((cachedCard) => cachedCard.location === targetLocation);
    return this.filterCardsDetails(relevantCards, details);
  }

  /**
   * Finds a specific card.
   * @param cardKey Card key to find
   * @param details Card details to be included in the card
   * @throws if card does not exist in the container
   */
  protected findCard(cardKey: string, details?: FetchCardDetails): Card {
    const cachedCard = this.cardCache.getCard(cardKey);
    if (cachedCard) {
      // Apply content type transformation if needed
      const content = cachedCard.content;
      if (details?.contentType === 'html' && content) {
        const processor = asciidoctor();
        processor.convert(content) as string;
      }
      return this.filterCardDetails(cachedCard, details);
    }
    throw new Error(`Card '${cardKey}' does not exist in the project`);
  }

  /**
   * Removes a card. If card has children, they are removed as well.
   * @param cardKey Card key to remove.
   * @returns true, if card was removed; false otherwise
   */
  protected async removeCard(cardKey: string): Promise<boolean> {
    const card = this.cardCache.getCard(cardKey);
    if (card) {
      // Children must removed first
      const children = card.children;
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
   * @returns true if card was updated; false otherwise.
   */
  protected async saveCardMetadata(card: Card): Promise<boolean> {
    if (card.metadata != null) {
      const metadataFile = join(card.path, CardContainer.cardMetadataFile);
      card.metadata!.lastUpdated = new Date().toISOString();

      const sanitizedMetadata = CardContainer.sanitizeMetadata(card);
      await writeJsonFile(metadataFile, sanitizedMetadata);
      return this.cardCache.updateCardMetadata(card.key, card.metadata);
    }
    return false;
  }

  /**
   * Removes non-metadata fields that should not be persisted.
   *
   * @param metadata The metadata object to sanitize
   * @returns Clean metadata object with only valid metadata fields
   */
  private static sanitizeMetadata(card: Card): CardMetadata {
    const sanitized: Record<string, unknown> = {};
    const KNOWN_METADATA_FIELDS = ['labels', 'links'];

    if (card.metadata) {
      for (const [key, value] of Object.entries(card.metadata)) {
        // Keys are not filtered out if they are: predefined, known, or field types
        if (
          isPredefinedField(key) ||
          KNOWN_METADATA_FIELDS.includes(key) ||
          key.includes('/')
        ) {
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
    const relevantCards = Array.from(this.cardCache.getCards()).filter(
      (cachedCard) => cachedCard.location === container,
    );

    relevantCards.forEach((card) => {
      if (
        card.parent === ROOT ||
        !card.parent ||
        !relevantCards.find((cachedCard) => cachedCard.key === card.parent)
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
