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

import type { CardCache } from './project/card-cache.js';
import type { CardTree } from './project/card-tree.js';
import { getChildLogger } from '../utils/log-utils.js';

import type {
  CardAttachment,
  Card,
  CardNode,
} from '../interfaces/project-interfaces.js';

/**
 * Card container base class. Used for both Project and Template.
 * Contains common card-related functionality.
 *
 * Each container's cards live in its own tree; the subclass says which one.
 */
export abstract class CardContainer {
  public basePath: string;
  protected prefix: string;

  /** The tree holding this container's cards. */
  protected abstract get cardTree(): CardTree;

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
  }

  // The tree's store. Transitional: the call sites that have not moved onto
  // the tree's own surface yet still reach the store through here.
  protected get cardCache(): CardCache {
    return this.cardTree.store;
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
    return this.cardTree.deleteSubtree(cardKey);
  }

  /**
   * Creates a card's folder on disk and writes its files.
   * @param card Card to create.
   */
  protected async createNode(card: Card): Promise<void> {
    return this.cardTree.createNode(card);
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
    return this.cardTree.writeContent(card);
  }

  /**
   * Persists card metadata.
   * @param card Card to persist
   * @returns true if the store was updated; false if the card has no metadata.
   * @throws if the metadata file cannot be written.
   */
  protected async saveCardMetadata(card: Card): Promise<boolean> {
    return this.cardTree.writeMetadata(card);
  }

  /**
   * Checks if container has the specified card.
   * @param cardKey Card key to check
   * @return true, if card is in the container
   */
  public hasCard(cardKey: string): boolean {
    return this.cardTree.has(cardKey);
  }
}
