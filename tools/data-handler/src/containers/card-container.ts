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

import type { CardCache } from './project/card-cache.js';
import { CardTree } from './project/card-tree.js';
import { deleteDir } from '../utils/file-utils.js';
import { getChildLogger } from '../utils/log-utils.js';
import { writeJsonFile } from '../utils/json.js';

import type {
  CardAttachment,
  Card,
  CardMetadata,
  CardNode,
} from '../interfaces/project-interfaces.js';

import { isPredefinedField } from '../utils/constants.js';

/**
 * Card container base class. Used for both Project and Template.
 * Contains common card-related functionality.
 */
export class CardContainer {
  public basePath: string;
  protected cardTree: CardTree;
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
    this.cardTree = new CardTree(this.prefix);
  }

  // The tree's store. Transitional: the call sites that have not moved onto
  // the tree's own surface yet still reach the cache through here.
  protected get cardCache(): CardCache {
    return this.cardTree.store;
  }

  /**
   * Determines the container from a given path.
   * @param path The filesystem path to analyze
   * @returns Location string: 'project' for project cards, template name for template cards
   */
  protected determineContainer(path: string): string {
    return this.cardTree.locationOf(path);
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
    return this.cardTree.attachmentsIn(this.determineContainer(path));
  }

  /**
   * Shows all cards from the container, fully hydrated.
   * @param path Path where cards should be listed.
   * @returns all cards from the container
   */
  protected cards(path: string): Card[] {
    return this.cardTree.cardsIn(this.determineContainer(path));
  }

  /**
   * Metadata-level view of every card in the container: no content, no
   * attachment listing.
   * @param path Path where cards should be listed.
   * @returns nodes of all cards from the container
   */
  protected cardNodes(path: string): CardNode[] {
    return this.cardTree.cardNodesIn(this.determineContainer(path));
  }

  /**
   * Card keys of every card in the container.
   * @param path Path where cards should be listed.
   * @returns keys of all cards from the container
   */
  protected cardKeys(path: string): string[] {
    return this.cardTree.cardKeysIn(this.determineContainer(path));
  }

  /**
   * Metadata-level view of one card: no content, no attachment listing.
   * @param cardKey Card key to find
   * @throws if card does not exist in the container
   */
  protected cardNode(cardKey: string): CardNode {
    return this.cardTree.node(cardKey);
  }

  /**
   * Content of one card.
   * @param cardKey Card key to read
   * @returns the card's content, or undefined if it has none
   * @throws if card does not exist in the container
   */
  protected cardContent(cardKey: string): string | undefined {
    return this.cardTree.content(cardKey);
  }

  /**
   * Attachment listing of one card.
   * @param cardKey Card key to read
   * @returns the card's attachments
   * @throws if card does not exist in the container
   */
  protected cardAttachments(cardKey: string): CardAttachment[] {
    return this.cardTree.attachmentsOf(cardKey);
  }

  /**
   * Finds a specific card, fully hydrated.
   * @param cardKey Card key to find
   * @throws if card does not exist in the container
   */
  protected findCard(cardKey: string): Card {
    return this.cardTree.card(cardKey);
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
      const children = this.cardTree.childrenOf(cardKey);
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
    return this.cardTree.rootCardsIn(this.determineContainer(path));
  }

  /**
   * Checks if container has the specified card.
   * @param cardKey Card key to check
   * @return true, if card is in the container
   */
  public hasCard(cardKey: string): boolean {
    return this.cardTree.has(cardKey);
  }

  /**
   * Checks if container has the specified project card.
   * @param cardKey Card key to check
   * @return true, if card is in the container
   */
  public hasProjectCard(cardKey: string): boolean {
    return this.cardTree.hasProjectCard(cardKey);
  }

  /**
   * Checks if container has the specified template card.
   * @param cardKey Card key to check
   * @return true, if card is in the container
   */
  public hasTemplateCard(cardKey: string): boolean {
    return this.cardTree.hasTemplateCard(cardKey);
  }
}
