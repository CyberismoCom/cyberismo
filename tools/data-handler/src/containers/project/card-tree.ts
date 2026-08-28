/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
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
import { basename, join, resolve, sep } from 'node:path';
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';

import mime from 'mime-types';

import { CardCache } from './card-cache.js';
import { CardNotFoundError } from '../../exceptions/index.js';
import { cardPathParts } from '../../utils/card-utils.js';
import { deleteDir } from '../../utils/file-utils.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { writeJsonFile } from '../../utils/json.js';

import type {
  Card,
  CardAttachment,
  CardMetadata,
  CardNode,
} from '../../interfaces/project-interfaces.js';

import { isPredefinedField, ROOT } from '../../utils/constants.js';

// The location of cards that are not in a template.
const PROJECT_LOCATION = 'project';

// A card's own files, inside its folder.
const CARD_CONTENT_FILE = 'index.adoc';
const CARD_METADATA_FILE = 'index.json';
// A card's attachment folder, inside its folder.
const ATTACHMENT_FOLDER = 'a';

/**
 * Owner of the project's cards: their storage, their structure, their indexes
 * and their filesystem representation.
 *
 * The tree knows about card folders, card keys, parent-child edges and
 * locations. It knows nothing about workflows, card types, permissions or
 * clingo — anything that needs a query answer is a command-level concern and
 * belongs above this class. The one test that keeps the boundary honest: if it
 * needs a clingo answer, it is not a tree operation.
 *
 * Still a single merged tree holding the project's cards and every template's
 * cards, keyed by a 'location'. Splitting it into one tree per template is a
 * later step; until then the tree wraps one CardCache, which remains the
 * store (map plus adjacency and location indexes).
 */
export class CardTree {
  private readonly cache: CardCache;

  constructor(private readonly prefix: string) {
    this.cache = new CardCache(prefix);
  }

  /**
   * The underlying store.
   *
   * Transitional: callers that still reach past the tree for the raw cache go
   * through here, so the migration can proceed one call site at a time. New
   * code must use the tree's own surface instead.
   */
  public get store(): CardCache {
    return this.cache;
  }

  /**
   * The location a card at the given filesystem path belongs to.
   * @param path Filesystem path of a card, or of a folder holding cards.
   * @returns 'project' for project cards, otherwise the full template name.
   */
  public locationOf(path: string): string {
    return cardPathParts(this.prefix, path).template || PROJECT_LOCATION;
  }

  /**
   * The location a cached card belongs to.
   * @param cardKey Card key to look up.
   * @returns the card's location, or undefined if the card is not in the tree.
   */
  public locationOfCard(cardKey: string): string | undefined {
    return this.cache.getCard(cardKey)?.location;
  }

  /**
   * The child card keys of a card.
   * @param cardKey Card key whose children to return.
   * @returns child card keys, in tree insertion order.
   */
  public childrenOf(cardKey: string): string[] {
    return this.cache.childrenOf(cardKey);
  }

  /**
   * Whether the tree holds a card.
   * @param cardKey Card key to check.
   */
  public has(cardKey: string): boolean {
    return this.cache.hasCard(cardKey);
  }

  /**
   * Whether the tree holds the card as a project card (not a template card).
   * @param cardKey Card key to check.
   */
  public hasProjectCard(cardKey: string): boolean {
    return this.locationOfCard(cardKey) === PROJECT_LOCATION;
  }

  /**
   * Whether the tree holds the card as a template card.
   * @param cardKey Card key to check.
   */
  public hasTemplateCard(cardKey: string): boolean {
    const location = this.locationOfCard(cardKey);
    return location !== undefined && location !== PROJECT_LOCATION;
  }

  /**
   * Whether the tree has been loaded.
   */
  public get isPopulated(): boolean {
    return this.cache.isPopulated;
  }

  // Identity and tree position, with the store-internal 'location' dropped.
  // The metadata is shared with the store, so a node is a read-only view: its
  // callers are audited and none of them writes to what they get back.
  // Callers that modify metadata use cardsIn()/card(), which hand out a copy.
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
  // and the content and attachment listing shared with the store.
  private static cardView(card: Card): Card {
    return {
      ...CardTree.nodeView(card),
      metadata: structuredClone(card.metadata),
      content: card.content,
      attachments: card.attachments,
    };
  }

  // Reads of a whole location are meaningless before the tree is loaded: it
  // would answer 'no cards' rather than 'not known yet'.
  private assertPopulated() {
    if (!this.isPopulated) {
      throw new Error('Cards cache is not populated!');
    }
  }

  /**
   * Every card in a location, fully hydrated.
   * @param location 'project', or a full template name.
   * @returns hydrated cards, in tree insertion order.
   * @throws if the tree has not been loaded
   */
  public cardsIn(location: string): Card[] {
    this.assertPopulated();
    return this.cache.cardsAtLocation(location).map(CardTree.cardView);
  }

  /**
   * Metadata-level view of every card in a location: no content, no
   * attachment listing.
   * @param location 'project', or a full template name.
   * @throws if the tree has not been loaded
   */
  public cardNodesIn(location: string): CardNode[] {
    this.assertPopulated();
    return this.cache.cardsAtLocation(location).map(CardTree.nodeView);
  }

  /**
   * The card keys in a location.
   * @param location 'project', or a full template name.
   * @throws if the tree has not been loaded
   */
  public cardKeysIn(location: string): string[] {
    this.assertPopulated();
    return this.cache.keysAtLocation(location);
  }

  /**
   * The stored card objects in a location, not copies.
   *
   * Transitional, and the reason it is named this way: several callers still
   * modify what they read here, and the branch that flips the read boundary to
   * immutable snapshots needs them enumerated rather than hidden behind the
   * same name as the copying reads.
   * @param location 'project', or a full template name.
   */
  public liveCardsIn(location: string): Card[] {
    return this.cache.cardsAtLocation(location);
  }

  /**
   * How many cards a location holds.
   * @param location 'project', or a full template name.
   */
  public cardCountIn(location: string): number {
    return this.cache.cardCountAtLocation(location);
  }

  /**
   * Every attachment of every card in a location.
   * @param location 'project', or a full template name.
   */
  public attachmentsIn(location: string): CardAttachment[] {
    const attachments: CardAttachment[] = [];
    this.cache
      .cardsAtLocation(location)
      .filter((card) => card.attachments.length > 0)
      .forEach((card) => attachments.push(...card.attachments));
    return attachments;
  }

  /**
   * The root cards of a location, i.e. the cards with no parent inside it.
   * @param location 'project', or a full template name.
   * @returns the location's root cards, each with its children populated.
   */
  public rootCardsIn(location: string): Card[] {
    const rootCards: Card[] = [];
    for (const card of this.cache.cardsAtLocation(location)) {
      // A card is a root of this location if it says so, or if its parent is
      // not a card of this location.
      if (
        card.parent === ROOT ||
        !card.parent ||
        this.locationOfCard(card.parent) !== location
      ) {
        rootCards.push({ ...card, children: card.children });
      }
    }
    return rootCards;
  }

  /**
   * Every template card in the tree, i.e. every card not in the project
   * location.
   */
  public allTemplateCards(): Card[] {
    return this.cache.getAllTemplateCards();
  }

  /**
   * One card, fully hydrated.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public card(cardKey: string): Card {
    return CardTree.cardView(this.cached(cardKey));
  }

  /**
   * Metadata-level view of one card: no content, no attachment listing.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public node(cardKey: string): CardNode {
    return CardTree.nodeView(this.cached(cardKey));
  }

  /**
   * The content of one card.
   * @param cardKey Card key to read.
   * @returns the card's content, or undefined if it has none.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public content(cardKey: string): string | undefined {
    return this.cached(cardKey).content;
  }

  /**
   * The attachment listing of one card.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public attachmentsOf(cardKey: string): CardAttachment[] {
    return this.cached(cardKey).attachments;
  }

  /**
   * The stored card object, not a copy, or undefined if the tree does not hold
   * it. Same transitional caveat as liveCardsIn: the callers left on this
   * accessor are the ones that modify what they read.
   * @param cardKey Card key to read.
   */
  public liveCard(cardKey: string): Card | undefined {
    return this.cache.getCard(cardKey);
  }

  /**
   * The stored cards for the given keys, not copies. Keys the tree does not
   * hold are skipped.
   * @param cardKeys Card keys to read.
   */
  public liveCardsFor(cardKeys: string[]): Card[] {
    const cards: Card[] = [];
    for (const cardKey of cardKeys) {
      const card = this.cache.getCard(cardKey);
      if (card) {
        cards.push(card);
      }
    }
    return cards;
  }

  // The stored card, or a CardNotFoundError.
  private cached(cardKey: string): Card {
    const card = this.cache.getCard(cardKey);
    if (!card) {
      throw new CardNotFoundError(cardKey);
    }
    return card;
  }

  /**
   * The folder holding a card's attachments.
   * @param cardKey Card key to locate.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public attachmentFolderOf(cardKey: string): string {
    return join(this.cached(cardKey).path, ATTACHMENT_FOLDER);
  }

  /**
   * Creates a card's folder on disk and writes its content and metadata.
   *
   * Does not put the card into the store: adding a created card is the
   * caller's notification step, which also runs the creation query and its
   * side effects, and neither belongs to the tree.
   * @param card Card to create. Its 'path' is where the folder goes.
   */
  public async createNode(card: Card): Promise<void> {
    await mkdir(card.path, { recursive: true });
    await this.writeContent(card);
    await this.writeMetadata(card);
  }

  /**
   * Persists a card's content, and keeps the store in step with it.
   * @param card Card to persist.
   * @returns true if the store was updated; false if the card has no content.
   */
  public async writeContent(card: Card): Promise<boolean> {
    if (card.content == null) {
      return false;
    }
    await writeFile(join(card.path, CARD_CONTENT_FILE), card.content);
    return this.cache.updateCardContent(card.key, card.content);
  }

  /**
   * Persists a card's metadata, and keeps the store in step with it. Stamps
   * 'lastUpdated'.
   * @param card Card to persist.
   * @returns true if the store was updated; false if the card has no metadata.
   * @throws if the metadata file cannot be written.
   */
  public async writeMetadata(card: Card): Promise<boolean> {
    if (card.metadata == null) {
      return false;
    }
    card.metadata.lastUpdated = new Date().toISOString();

    // Cache the same object that was written, so store and disk agree.
    const sanitizedMetadata = CardTree.sanitizeMetadata(card);
    await writeJsonFile(join(card.path, CARD_METADATA_FILE), sanitizedMetadata);
    return this.cache.updateCardMetadata(card.key, sanitizedMetadata);
  }

  /**
   * Deletes a card's folder and its descendants', and drops them from the
   * store. Children go first, so a failure part-way leaves no card whose
   * folder is gone but whose parent's is not.
   * @param cardKey Root of the subtree to delete.
   * @returns true if the card was in the tree; false otherwise.
   */
  public async deleteSubtree(cardKey: string): Promise<boolean> {
    const card = this.cache.getCard(cardKey);
    if (!card) {
      return false;
    }
    // The child list is a snapshot: removing a child replaces the parent's
    // list in the adjacency index rather than mutating the array walked here.
    for (const child of this.childrenOf(cardKey)) {
      await this.deleteSubtree(child);
    }
    await deleteDir(card.path);
    return this.cache.deleteCard(cardKey);
  }

  /**
   * Adds an attachment to a card: writes the file and records it in the store.
   * @param cardKey Card to attach to.
   * @param attachmentName Name for the attachment file.
   * @param attachmentData Buffer to write, or path of a file to copy.
   * @throws CardNotFoundError if the tree does not hold the card, or if the
   *   source file cannot be read.
   */
  public async addAttachment(
    cardKey: string,
    attachmentName: string,
    attachmentData: string | Buffer,
  ): Promise<void> {
    const attachmentFolder = this.attachmentFolderOf(cardKey);
    await mkdir(attachmentFolder, { recursive: true });

    const fileName = basename(attachmentName);
    const attachmentPath = join(attachmentFolder, fileName);

    if (Buffer.isBuffer(attachmentData)) {
      await writeFile(attachmentPath, attachmentData, { flag: 'wx' });
    } else {
      try {
        await copyFile(
          attachmentData,
          attachmentPath,
          fsConstants.COPYFILE_EXCL,
        );
      } catch {
        throw new Error(`Attachment file not found: ${attachmentData}`);
      }
    }

    this.cache.addAttachment(cardKey, fileName);
  }

  /**
   * Removes an attachment from a card: deletes the file and drops it from the
   * store.
   * @param cardKey Card to remove the attachment from.
   * @param fileName Attachment file name to remove.
   * @throws CardNotFoundError if the tree does not hold the card, if the file
   *   name escapes the card's attachment folder, or if the file is not there.
   */
  public async removeAttachment(
    cardKey: string,
    fileName: string,
  ): Promise<void> {
    const attachmentFolder = this.attachmentFolderOf(cardKey);
    const attachmentPath = resolve(attachmentFolder, fileName);

    // Prevent path traversal
    if (!attachmentPath.startsWith(resolve(attachmentFolder) + sep)) {
      throw new Error(`Invalid attachment filename: ${fileName}`);
    }

    try {
      await unlink(attachmentPath);
    } catch (error) {
      CardTree.logger.error({ error }, 'Removing card attachment');
      throw new Error(`Attachment not found: ${fileName}`, { cause: error });
    }
    this.cache.deleteAttachment(cardKey, fileName);
  }

  /**
   * Renames a card's attachment file, and keeps the store in step with it.
   *
   * The only API for this. The project-prefix rename used to rename the file
   * on disk raw and leave the store holding the old fileName, which is only
   * invisible today because that command reloads the whole tree afterwards.
   * @param cardKey Card whose attachment is renamed.
   * @param fileName Current attachment file name.
   * @param newFileName New attachment file name.
   * @throws CardNotFoundError if the tree does not hold the card, or if it
   *   holds no such attachment.
   */
  public async renameAttachment(
    cardKey: string,
    fileName: string,
    newFileName: string,
  ): Promise<void> {
    const card = this.cached(cardKey);
    const attachment = card.attachments.find(
      (item) => item.fileName === fileName,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${fileName}`);
    }
    if (fileName === newFileName) {
      return;
    }

    await rename(
      join(attachment.path, fileName),
      join(attachment.path, newFileName),
    );

    // Updated in place rather than by replacing the array: concurrent renames
    // of a card's attachments each touch their own element, and every holder
    // of the listing shares that array with the store.
    attachment.fileName = newFileName;
    attachment.mimeType = mime.lookup(newFileName) || null;
    this.cache.updateCardAttachments(cardKey, card.attachments);
  }

  /**
   * Loads the cards under a filesystem path into the tree.
   * @param path Folder to load cards from, recursively.
   * @throws DuplicateCardKeyError if a loaded card key is already in the tree
   */
  public async load(path: string): Promise<void> {
    await this.cache.populateFromPath(path);
  }

  /**
   * Empties the tree.
   */
  public clear() {
    this.cache.clear();
  }

  /**
   * Drops a location's cards from the tree.
   * @param location 'project', or a full template name.
   */
  public evictLocation(location: string) {
    this.cache.deleteCardsFromTemplate(location);
  }

  /**
   * Drops every template card from the tree, keeping the project's own cards.
   */
  public evictAllTemplateCards() {
    this.cache.deleteAllTemplateCards();
  }

  /**
   * Reloads one location's cards from disk.
   *
   * Eviction precedes the load because the reloaded cards keep their keys and
   * the store rejects a key it already holds.
   * @param location 'project', or a full template name.
   * @param cardsFolder Folder the location's cards live in.
   */
  public async reloadLocation(
    location: string,
    cardsFolder: string,
  ): Promise<void> {
    this.evictLocation(location);
    await this.load(cardsFolder);
  }

  // Removes non-metadata fields that should not be persisted.
  private static sanitizeMetadata(card: Card): CardMetadata {
    const sanitized: Record<string, unknown> = {};

    if (card.metadata) {
      for (const [key, value] of Object.entries(card.metadata)) {
        // JSON.stringify drops undefined, so drop it here too: the store must
        // not retain keys the file lacks.
        if (value === undefined) {
          continue;
        }
        // Keys are not filtered out if they are: predefined, or field types
        if (isPredefinedField(key) || key.includes('/')) {
          sanitized[key] = value;
        } else {
          CardTree.logger.warn(
            `Card ${card.key} had extra metadata key ${key} with value ${value}. Key was removed`,
          );
        }
        // Everything else is filtered out
      }
    }

    return sanitized as CardMetadata;
  }

  private static get logger() {
    return getChildLogger({ module: 'cardTree' });
  }
}
