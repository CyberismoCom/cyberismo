/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
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
import type { Dirent } from 'node:fs';
import { basename, join } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

import type {
  Card,
  CardAttachment,
  CardMetadata,
} from '../../interfaces/project-interfaces.js';
import { CardNameRegEx } from '../../interfaces/project-interfaces.js';
import { cardPathParts, parentCard } from '../../utils/card-utils.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { pathExists } from '../../utils/file-utils.js';

import mime from 'mime-types';

/**
 * Extended card interface that includes location metadata.
 * For project cards: location = 'project'
 * For template cards: location = template name (e.g., 'decision/templates/decision')
 */
interface CachedCard extends Card {
  location: string;
}

const cardMetadataFile = 'index.json';
const cardContentFile = 'index.adoc';

/**
 *
 */
export class CardCache {
  private cardCache: Map<string, CachedCard> = new Map();
  private cachePopulated: boolean = false;
  constructor(private prefix: string) {}

  // Recursively builds children relationships for all cards in the cache.
  private buildChildrenRelationshipsRecursively() {
    // Helper function to recursively populate children for a card
    const populateChildren = (cardKey: string, cardCopy: Card) => {
      const directChildren: string[] = [];
      for (const potentialChild of this.getCards()) {
        if (potentialChild.parent === cardKey) {
          directChildren.push(potentialChild.key);
        }
      }
      cardCopy.children = directChildren;
    };

    // Populate children for all cards in the cache
    for (const card of this.getCards()) {
      populateChildren(card.key, card);
    }
  }

  // Determines the location from a given path: 'project' for project cards, template name for template cards
  private determineLocationFromPath(path: string): string {
    return cardPathParts(this.prefix, path).template || 'project';
  }

  // Gets all directory entries recursively.
  private async entries(path: string): Promise<Dirent[]> {
    try {
      return await readdir(path, { withFileTypes: true, recursive: true });
    } catch (error) {
      CardCache.logger.error({ error }, 'Reading entries');
      return [];
    }
  }

  // Gets attachments from disk.
  private async fetchAttachments(
    currentPath: string,
  ): Promise<CardAttachment[]> {
    const attachmentPath = join(currentPath, 'a');
    if (!pathExists(attachmentPath)) {
      CardCache.logger.info(`No attachment path for ${currentPath}`);
      return [];
    }

    const fileAttachments = await this.entries(attachmentPath);
    const attachments: CardAttachment[] = [];
    const seenAttachments = new Set<string>();

    fileAttachments.forEach((attachment) => {
      const cardKey = basename(currentPath);
      const attachmentKey = `${cardKey}:${attachment.parentPath}:${attachment.name}`;

      // Skip duplicate attachments based on card, path, and filename
      if (!seenAttachments.has(attachmentKey)) {
        seenAttachments.add(attachmentKey);
        attachments.push({
          card: cardKey,
          fileName: attachment.name,
          path: attachment.parentPath,
          mimeType: mime.lookup(attachment.name) || null,
        });
      } else {
        CardCache.logger.warn(
          `Duplicate attachment found during cache population: ${attachment.name} for card ${cardKey}`,
        );
      }
    });

    return attachments;
  }

  // Gets content from disk.
  private async fetchContent(
    currentPath: string,
  ): Promise<string | CardAttachment[] | Card[]> {
    return readFile(join(currentPath, cardContentFile), {
      encoding: 'utf-8',
    });
  }

  // Gets metadata from disk.
  private async fetchMetadata(currentPath: string): Promise<string> {
    function injectLinksIfMissing(metadata: string): string {
      if (metadata !== '' && !metadata.includes('"links":')) {
        const end = metadata.lastIndexOf('}');
        metadata = metadata.slice(0, end - 1) + ',\n    "links": []\n' + '}';
      }
      return metadata;
    }
    let metadata = await readFile(join(currentPath, cardMetadataFile), {
      encoding: 'utf-8',
    });
    metadata = injectLinksIfMissing(metadata);
    return metadata;
  }

  // Builds the card cache from filesystem.
  private async fetchFileEntries(path: string) {
    const allEntries = await this.entries(path);
    const cardEntries = allEntries.filter(
      (entry) => entry.isDirectory() && CardNameRegEx.test(entry.name),
    );

    // Process all card entries in parallel
    const cardPromises = cardEntries.map(async (entry) => {
      const currentPath = join(entry.parentPath, entry.name);
      const location = this.determineLocationFromPath(currentPath);

      const [cardContent, cardMetadata, cardAttachments] = await Promise.all([
        this.fetchContent(currentPath),
        this.fetchMetadata(currentPath),
        this.fetchAttachments(currentPath),
      ]);

      return {
        key: entry.name,
        path: currentPath,
        children: [],
        attachments: Array.isArray(cardAttachments) ? cardAttachments : [],
        content: typeof cardContent === 'string' ? cardContent : '',
        metadata: JSON.parse(cardMetadata),
        parent: parentCard(currentPath),
        location: location,
      };
    });

    // Wait for all cards to be processed and add them to the cards array
    const processedCards = await Promise.all(cardPromises);
    return processedCards;
  }

  // Populates the cache from the given array of cards
  private populateFromCards(cards: CachedCard[]) {
    const newMap = new Map(
      cards?.map((card): [string, CachedCard] => {
        return [card.key, card];
      }),
    );
    this.cardCache = new Map([...this.cardCache, ...newMap]);

    // Remove possible duplicates, card IDs must be unique
    const cardIds = cards.map((item) => item.key);
    const duplicates = cardIds.reduce<string[]>(
      (acc, v, i, arr) =>
        arr.indexOf(v) === i || acc.includes(v) ? acc : acc.concat(v),
      [],
    );
    if (duplicates.length > 0) {
      throw new Error(`Duplicate card keys found: ${duplicates}`);
    }

    this.populateChildrenRelationships();
    this.cachePopulated = true;
    CardCache.logger.info(`Card cache populated`);
  }

  // Returns instance of logger.
  private static get logger() {
    return getChildLogger({
      module: 'cardCache',
    });
  }

  /**
   * Adds attachment to a card in the cache.
   * @param cardKey card key for which to add new attachment
   * @param fileName attachment fileName
   * @returns true, if attachment was added to the cache; false otherwise.
   */
  public addAttachment(cardKey: string, fileName: string) {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      CardCache.logger.warn(
        `Cannot add attachment to card '${cardKey}. Card does not exist.'`,
      );
      return false;
    }
    const attachmentFolder = join(card.path, 'a');
    const attachment: CardAttachment = {
      card: cardKey,
      path: attachmentFolder,
      fileName: fileName,
      mimeType: mime.lookup(fileName!) || null,
    };

    // Check for duplicate attachments based on card, path, and filename
    const isDuplicate = card.attachments.some(
      (existingAttachment) =>
        existingAttachment.card === attachment.card &&
        existingAttachment.path === attachment.path &&
        existingAttachment.fileName === attachment.fileName,
    );

    if (isDuplicate) {
      CardCache.logger.warn(
        `Duplicate attachment prevented: ${attachment.fileName} for card ${cardKey}`,
      );
      return false;
    }

    card.attachments.push(attachment);
    this.cardCache.set(cardKey, card);
    return true;
  }

  /**
   * Empties the cache.
   */
  public clear() {
    CardCache.logger.info(`Card cache cleared`);
    this.cachePopulated = false;
    this.cardCache.clear();
  }

  /**
   * Removes a card from the cache.
   * @param cardKey card key to remove
   * @returns true, if card was removed from the cache; false otherwise
   */
  public deleteCard(cardKey: string) {
    const cardExists = this.cardCache.has(cardKey);
    if (cardExists) {
      this.cardCache.delete(cardKey);
    }
    return cardExists;
  }

  /**
   * Removes attachment from a card in the cache.
   * @param cardKey card key of card from which attachment is to be removed
   * @param filename attachment filename to remove
   * @returns true, if attachment was removed from the cache; false otherwise
   */
  public deleteAttachment(cardKey: string, filename: string): boolean {
    const cachedCard = this.cardCache.get(cardKey);
    if (cachedCard && cachedCard.attachments) {
      const attachmentExists = cachedCard.attachments.find(
        (item) => item.fileName === filename,
      );
      cachedCard.attachments = cachedCard.attachments.filter(
        (attachment) => attachment.fileName !== filename,
      );
      return attachmentExists ? true : false;
    }
    return false;
  }

  /**
   * Removes template's cards from the cache.
   * @param templateName Name of the template
   */
  public deleteCardsFromTemplate(templateName: string) {
    for (const card of this.cardCache.values()) {
      if (card.location === templateName) {
        this.deleteCard(card.key);
      }
    }
  }

  /**
   * Returns all the template cards in the cache.
   * @returns all the template cards in the cache.
   */
  public getAllTemplateCards(): CachedCard[] {
    return Array.from(this.cardCache.values()).filter(
      (item) => item.location !== 'project',
    );
  }

  /**
   * Returns a card from the cache.
   * @param cardKey card key to find
   * @returns card from the cache; if not found then returns undefined.
   */
  public getCard(cardKey: string): CachedCard | undefined {
    return this.cardCache.get(cardKey);
  }

  /**
   * Returns all the cards in the cache.
   * @returns all the cards in the cache
   */
  public getCards(): CachedCard[] {
    return Array.from(this.cardCache.values());
  }

  /**
   * Returns all the attachments in the cache for a given card key.
   * @param cardKey Card key for which to fetch all the attachments for.
   * @returns all the attachments in the cache for a given card key.
   */
  public getCardAttachments(cardKey: string): CardAttachment[] | undefined {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      CardCache.logger.warn(`Card '${cardKey}' not found`);
      return undefined;
    }
    return card.attachments;
  }

  /**
   * Checks if card is in the cache; false otherwise.
   * @param cardKey card key to check
   * @returns true if card is in the cache; false otherwise
   */
  public hasCard(cardKey: string): boolean {
    return this.cardCache.has(cardKey);
  }

  /**
   * Checks if card in cache has attachment.
   * @param cardKey card key to check
   * @param filename attachment file name to find
   * @returns true, if card in cache has attachment; false otherwise.
   */
  public hasCardAttachment(cardKey: string, filename: string): boolean {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      CardCache.logger.warn(`Card '${cardKey}' not found`);
      return false;
    }
    const attachment = card.attachments.find(
      (item) => item.fileName === filename,
    );
    return attachment ? true : false;
  }

  /**
   * Checks if cache has been already populated.
   * @returns true if cache has already been populated; otherwise false
   */
  public get isPopulated(): boolean {
    return this.cachePopulated;
  }

  /**
   * Re-builds the existing cache's parent-child relationships info.
   */
  public populateChildrenRelationships() {
    CardCache.logger.info(`Card children relationships re-built`);
    for (const card of this.getCards()) {
      card.children = [];
    }
    this.buildChildrenRelationshipsRecursively();
  }

  /**
   * Populates the cache from a given path
   * @param path File system path where the cache should be built from.
   */
  public async populateFromPath(path: string) {
    const cards = await this.fetchFileEntries(path);
    this.populateFromCards(cards);
  }

  /**
   * Updates, or adds a card to cache.
   * @param cardKey Card key
   * @param cardData Updated data.
   */
  public updateCard(cardKey: string, cardData: Card) {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      const targetLocation = this.determineLocationFromPath(cardData.path);
      const extendedCard: CachedCard = {
        ...cardData,
        location: targetLocation,
      };
      this.cardCache.set(cardKey, extendedCard);
      return;
    }
    if (!card?.path) {
      CardCache.logger.info(`Missing path for a card '${cardKey}'`);
      throw new Error(`No path in card!`);
    }
    if (!cardData?.path) {
      CardCache.logger.info(`Missing path for a card data '${cardKey}'`);
      throw new Error(`No path in card data!`);
    }
    const targetLocation = this.determineLocationFromPath(cardData.path);

    const extendedCard: CachedCard = {
      ...card, // Existing card data
      ...cardData, // Override with new data
      location: targetLocation,
      // Explicitly preserve certain data if it exists in the cached card but not in cardData
      metadata: cardData.metadata ?? card.metadata,
      content: cardData.content ?? card.content,
      attachments: cardData.attachments ?? card.attachments,
    };
    this.cardCache.set(cardKey, extendedCard);
  }

  /**
   * Updates card's attachments.
   * @param cardKey card key of a card to update
   * @param attachments Attachments to use in the card.
   * @returns true, if update succeeded; false otherwise.
   */
  public updateCardAttachments(cardKey: string, attachments: CardAttachment[]) {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      CardCache.logger.warn(`Card '${cardKey}' not found`);
      return false;
    }
    card.attachments = attachments;
    this.cardCache.set(cardKey, card);
    return true;
  }

  /**
   * Updates card's content in the cache.
   * @param cardKey card key of a card to update.
   * @param content New content for the card.
   * @returns true, if update succeeded; false otherwise.
   */
  public updateCardContent(cardKey: string, content: string) {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      CardCache.logger.warn(`Card '${cardKey}' not found`);
      return false;
    }
    card.content = content;
    this.cardCache.set(cardKey, card);
    return true;
  }

  /**
   * Updates card's metadata in the cache.
   * @param cardKey card key of a card to update.
   * @param metadata New metadata for the card.
   * @returns true, if update succeeded; false otherwise.
   */
  public updateCardMetadata(cardKey: string, metadata: CardMetadata) {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      CardCache.logger.warn(`Card '${cardKey}' not found`);
      return false;
    }
    card.metadata = metadata;
    this.cardCache.set(cardKey, card);
    return true;
  }
}
