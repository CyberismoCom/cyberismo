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
import { basename, dirname, join, resolve, sep } from 'node:path';
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises';

import mime from 'mime-types';

import type {
  Card,
  CardAttachment,
  CardMetadata,
  CardNode,
  MetadataContent,
} from '../../interfaces/project-interfaces.js';
import { CardNameRegEx } from '../../interfaces/project-interfaces.js';
import { cardPathParts, parentCard } from '../../utils/card-utils.js';
import {
  CardNotFoundError,
  DuplicateCardKeyError,
} from '../../exceptions/index.js';
import { deleteDir } from '../../utils/file-utils.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { writeJsonFile } from '../../utils/json.js';
import { isPredefinedField, ROOT } from '../../utils/constants.js';

// A stored card also remembers which location holds it.
interface StoredCard extends Card {
  location: string;
}

// A card's own files, inside its folder.
const CARD_CONTENT_FILE = 'index.adoc';
const CARD_METADATA_FILE = 'index.json';
// A card's attachment folder, inside its folder.
const ATTACHMENT_FOLDER = 'a';

// The location of cards that are not in a template.
const PROJECT_LOCATION = 'project';

/**
 * Owner of the project's cards: their storage, their structure, their indexes
 * and their filesystem representation. Knows nothing about workflows, card
 * types or clingo.
 *
 * Reads return their elements in unspecified but stable order: the order does
 * not change between reads of a location that was not mutated. A caller that
 * needs a particular order sorts for it.
 */
export class CardTree {
  private cards: Map<string, StoredCard> = new Map();
  private childrenIndex: Map<string, string[]> = new Map();
  private locationIndex: Map<string, Set<string>> = new Map();
  private populated: boolean = false;

  constructor(private readonly prefix: string) {}

  private setChildren(parentKey: string, children: string[]) {
    if (children.length === 0) {
      this.childrenIndex.delete(parentKey);
    } else {
      this.childrenIndex.set(parentKey, children);
    }
    const parent = this.cards.get(parentKey);
    if (parent) {
      parent.children = children;
    }
  }

  private attachToParent(cardKey: string, parentKey?: string) {
    if (!parentKey) {
      return;
    }
    const siblings = this.childrenIndex.get(parentKey);
    if (!siblings) {
      this.setChildren(parentKey, [cardKey]);
      return;
    }
    siblings.push(cardKey);
  }

  // The list is replaced, not mutated: callers walk a parent's child list while
  // removing cards from it and must keep seeing the snapshot they started with.
  private detachFromParent(cardKey: string, parentKey?: string) {
    if (!parentKey) {
      return;
    }
    const siblings = this.childrenIndex.get(parentKey);
    if (!siblings?.includes(cardKey)) {
      return;
    }
    this.setChildren(
      parentKey,
      siblings.filter((sibling) => sibling !== cardKey),
    );
  }

  private addToLocation(cardKey: string, location: string) {
    const keys = this.locationIndex.get(location);
    if (!keys) {
      this.locationIndex.set(location, new Set([cardKey]));
      return;
    }
    keys.add(cardKey);
  }

  private removeFromLocation(cardKey: string, location?: string) {
    if (!location) {
      return;
    }
    const keys = this.locationIndex.get(location);
    if (!keys?.delete(cardKey) || keys.size > 0) {
      return;
    }
    this.locationIndex.delete(location);
  }

  private store(cardKey: string, card: StoredCard) {
    const previous = this.cards.get(cardKey);
    card.children = this.childrenIndex.get(cardKey) ?? [];
    this.cards.set(cardKey, card);
    if (previous?.parent !== card.parent) {
      this.detachFromParent(cardKey, previous?.parent);
      this.attachToParent(cardKey, card.parent);
    }
    if (previous?.location !== card.location) {
      this.removeFromLocation(cardKey, previous?.location);
      this.addToLocation(cardKey, card.location);
    }
  }

  private unstore(cardKey: string): boolean {
    const card = this.cards.get(cardKey);
    if (!card) {
      return false;
    }
    this.cards.delete(cardKey);
    this.detachFromParent(cardKey, card.parent);
    this.removeFromLocation(cardKey, card.location);
    return true;
  }

  // The stored card, or a CardNotFoundError.
  private stored(cardKey: string): StoredCard {
    const card = this.cards.get(cardKey);
    if (!card) {
      throw new CardNotFoundError(cardKey);
    }
    return card;
  }

  // Stored metadata is frozen; node-level reads share it. Always a fresh
  // object, so the tree never aliases metadata its producer still holds.
  private static normalizedMetadata(
    metadata?: CardMetadata,
  ): CardMetadata | undefined {
    if (!metadata) {
      return metadata;
    }
    const stored: Record<string, MetadataContent> = {};
    for (const [key, value] of Object.entries(metadata)) {
      stored[key] = Array.isArray(value) ? CardTree.frozenList(value) : value;
    }
    if (!Array.isArray(stored.links)) {
      stored.links = CardTree.frozenList([]);
    }
    return Object.freeze(stored) as CardMetadata;
  }

  // 'links' and 'externalLinks' hold objects, so the elements are frozen too.
  private static frozenList(values: unknown[]): MetadataContent {
    return Object.freeze(
      values.map((item) =>
        item !== null && typeof item === 'object'
          ? Object.freeze({ ...item })
          : item,
      ),
    ) as MetadataContent;
  }

  // Identity and tree position, with the store-internal 'location' dropped.
  // The frozen metadata is shared with the store; 'children' is copied.
  private static nodeView(card: StoredCard): CardNode {
    return {
      key: card.key,
      path: card.path,
      children: [...card.children],
      metadata: card.metadata,
      parent: card.parent,
    };
  }

  // The fully hydrated card: identity, tree position, and copies of everything
  // a caller might modify.
  private static cardView(card: StoredCard): Card {
    return {
      ...CardTree.nodeView(card),
      metadata: structuredClone(card.metadata),
      content: card.content,
      attachments: card.attachments.map((attachment) => ({ ...attachment })),
    };
  }

  private static attachmentView(attachment: CardAttachment): CardAttachment {
    return { ...attachment };
  }

  // Reads of a whole location are meaningless before the tree is loaded: it
  // would answer 'no cards' rather than 'not known yet'.
  private assertPopulated() {
    if (!this.populated) {
      throw new Error('Cards cache is not populated!');
    }
  }

  // Gets all directory entries recursively.
  private async entries(path: string): Promise<Dirent[]> {
    try {
      return await readdir(path, { withFileTypes: true, recursive: true });
    } catch (error) {
      CardTree.logger.error({ error }, 'Reading entries');
      return [];
    }
  }

  // Every card's attachment listing, taken out of the one recursive sweep the
  // load already has; going back to disk per card read the same directories a
  // second time.
  private static attachmentsByCard(
    allEntries: Dirent[],
    cardFolders: Map<string, string>,
    root: string,
  ): Map<string, CardAttachment[]> {
    const attachments = new Map<string, CardAttachment[]>();
    const seen = new Set<string>();

    for (const entry of allEntries) {
      const cardKey = CardTree.attachmentOwner(entry, cardFolders, root);
      if (!cardKey) {
        continue;
      }
      const attachmentKey = `${cardKey}:${entry.parentPath}:${entry.name}`;
      if (seen.has(attachmentKey)) {
        CardTree.logger.warn(
          `Duplicate attachment found during cache population: ${entry.name} for card ${cardKey}`,
        );
        continue;
      }
      seen.add(attachmentKey);
      const attachment: CardAttachment = {
        card: cardKey,
        fileName: entry.name,
        path: entry.parentPath,
        mimeType: mime.lookup(entry.name) || null,
      };
      const listing = attachments.get(cardKey);
      if (listing) {
        listing.push(attachment);
      } else {
        attachments.set(cardKey, [attachment]);
      }
    }

    return attachments;
  }

  // Which card an entry is an attachment of: walks the entry's folder up to
  // the tree root looking for an attachment folder that belongs to a card.
  // Returns undefined when the entry is not inside one.
  private static attachmentOwner(
    entry: Dirent,
    cardFolders: Map<string, string>,
    root: string,
  ): string | undefined {
    let folder = resolve(entry.parentPath);
    while (folder !== root) {
      const parent = dirname(folder);
      if (parent === folder) {
        return undefined;
      }
      if (basename(folder) === ATTACHMENT_FOLDER) {
        const cardKey = cardFolders.get(parent);
        if (cardKey) {
          return cardKey;
        }
      }
      folder = parent;
    }
    return undefined;
  }

  // Gets content from disk.
  private async fetchContent(currentPath: string): Promise<string> {
    return readFile(join(currentPath, CARD_CONTENT_FILE), {
      encoding: 'utf-8',
    });
  }

  // Gets metadata from disk.
  private async fetchMetadata(currentPath: string): Promise<string> {
    return readFile(join(currentPath, CARD_METADATA_FILE), {
      encoding: 'utf-8',
    });
  }

  // Reads the cards under a path from disk.
  private async loadEntries(path: string): Promise<StoredCard[]> {
    const allEntries = await this.entries(path);
    const cardEntries = allEntries.filter(
      (entry) => entry.isDirectory() && CardNameRegEx.test(entry.name),
    );

    // Card folder -> card key, so an entry can be traced back to the card
    // whose attachment folder it sits in.
    const cardFolders = new Map<string, string>(
      cardEntries.map((entry) => [
        resolve(join(entry.parentPath, entry.name)),
        entry.name,
      ]),
    );
    const attachments = CardTree.attachmentsByCard(
      allEntries,
      cardFolders,
      resolve(path),
    );

    const cardPromises = cardEntries.map(async (entry) => {
      const currentPath = join(entry.parentPath, entry.name);
      const location = this.locationOf(currentPath);

      const [cardContent, cardMetadata] = await Promise.all([
        this.fetchContent(currentPath),
        this.fetchMetadata(currentPath),
      ]);

      let metadata;
      try {
        metadata = JSON.parse(cardMetadata);
      } catch (error) {
        const metadataPath = join(currentPath, CARD_METADATA_FILE);
        CardTree.logger.error(
          { error, metadataPath },
          `Incorrect card metadata file`,
        );
        if (error instanceof Error) {
          throw new Error(
            `Invalid JSON in file '${metadataPath}': ${error.message}`,
            { cause: error },
          );
        }
        throw error;
      }

      return {
        key: entry.name,
        path: currentPath,
        children: [],
        attachments: attachments.get(entry.name) ?? [],
        content: cardContent,
        metadata: CardTree.normalizedMetadata(metadata),
        parent: parentCard(currentPath),
        location: location,
      };
    });

    return Promise.all(cardPromises);
  }

  // Stores a batch of loaded cards.
  private populateFromCards(cards: StoredCard[]) {
    const duplicates: string[] = [];
    const batchKeys = new Set<string>();
    for (const card of cards) {
      if (
        (batchKeys.has(card.key) || this.cards.has(card.key)) &&
        !duplicates.includes(card.key)
      ) {
        duplicates.push(card.key);
      }
      batchKeys.add(card.key);
    }
    if (duplicates.length > 0) {
      throw new DuplicateCardKeyError(duplicates);
    }

    for (const card of cards) {
      this.store(card.key, card);
    }

    this.populated = true;
    CardTree.logger.info(`Card tree populated`);
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
    return getChildLogger({
      module: 'cardTree',
    });
  }

  /**
   * Whether the tree has been loaded.
   */
  public get isPopulated(): boolean {
    return this.populated;
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
   * The location a stored card belongs to.
   * @param cardKey Card key to look up.
   * @returns the card's location, or undefined if the card is not in the tree.
   */
  public locationOfCard(cardKey: string): string | undefined {
    return this.cards.get(cardKey)?.location;
  }

  /**
   * The child card keys of a card.
   * @param cardKey Card key whose children to return.
   * @returns child card keys, in tree insertion order.
   */
  public childrenOf(cardKey: string): string[] {
    return [...(this.childrenIndex.get(cardKey) ?? [])];
  }

  /**
   * Whether the tree holds a card.
   * @param cardKey Card key to check.
   */
  public has(cardKey: string): boolean {
    return this.cards.has(cardKey);
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
   * Every card in a location, fully hydrated.
   * @param location 'project', or a full template name.
   * @returns hydrated cards, in tree insertion order.
   * @throws if the tree has not been loaded
   */
  public cardsIn(location: string): Card[] {
    this.assertPopulated();
    return this.storedIn(location).map(CardTree.cardView);
  }

  /**
   * Metadata-level view of every card in a location: no content, no
   * attachment listing.
   * @param location 'project', or a full template name.
   * @throws if the tree has not been loaded
   */
  public cardNodesIn(location: string): CardNode[] {
    this.assertPopulated();
    return this.storedIn(location).map(CardTree.nodeView);
  }

  /**
   * The card keys in a location.
   * @param location 'project', or a full template name.
   * @throws if the tree has not been loaded
   */
  public cardKeysIn(location: string): string[] {
    this.assertPopulated();
    return [...(this.locationIndex.get(location) ?? [])];
  }

  /**
   * How many cards a location holds.
   * @param location 'project', or a full template name.
   */
  public cardCountIn(location: string): number {
    return this.locationIndex.get(location)?.size ?? 0;
  }

  /**
   * Every attachment of every card in a location.
   * @param location 'project', or a full template name.
   */
  public attachmentsIn(location: string): CardAttachment[] {
    const attachments: CardAttachment[] = [];
    for (const card of this.storedIn(location)) {
      attachments.push(...card.attachments.map(CardTree.attachmentView));
    }
    return attachments;
  }

  /**
   * The root cards of a location, i.e. the cards with no parent inside it.
   * @param location 'project', or a full template name.
   * @returns the location's root cards, each with its children populated.
   */
  public rootCardsIn(location: string): Card[] {
    const rootCards: Card[] = [];
    for (const card of this.storedIn(location)) {
      // A card is a root of this location if it says so, or if its parent is
      // not a card of this location.
      if (
        card.parent === ROOT ||
        !card.parent ||
        this.locationOfCard(card.parent) !== location
      ) {
        rootCards.push(CardTree.cardView(card));
      }
    }
    return rootCards;
  }

  /**
   * Every template card in the tree, i.e. every card not in the project
   * location.
   * @note A scan rather than a walk of the location index: the result is every
   *   template card, and callers depend on getting them in global tree order.
   */
  public allTemplateCards(): Card[] {
    return Array.from(this.cards.values())
      .filter((card) => card.location !== PROJECT_LOCATION)
      .map(CardTree.cardView);
  }

  /**
   * One card, fully hydrated.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public card(cardKey: string): Card {
    return CardTree.cardView(this.stored(cardKey));
  }

  /**
   * Metadata-level view of one card: no content, no attachment listing.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public node(cardKey: string): CardNode {
    return CardTree.nodeView(this.stored(cardKey));
  }

  /**
   * The content of one card.
   * @param cardKey Card key to read.
   * @returns the card's content, or undefined if it has none.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public content(cardKey: string): string | undefined {
    return this.stored(cardKey).content;
  }

  /**
   * The attachment listing of one card.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public attachmentsOf(cardKey: string): CardAttachment[] {
    return this.stored(cardKey).attachments.map(CardTree.attachmentView);
  }

  /**
   * The cards for the given keys, fully hydrated. Keys the tree does not hold
   * are skipped.
   * @param cardKeys Card keys to read.
   */
  public cardsFor(cardKeys: string[]): Card[] {
    const cards: Card[] = [];
    for (const cardKey of cardKeys) {
      const card = this.cards.get(cardKey);
      if (card) {
        cards.push(CardTree.cardView(card));
      }
    }
    return cards;
  }

  /**
   * The folder holding a card's attachments.
   * @param cardKey Card key to locate.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public attachmentFolderOf(cardKey: string): string {
    return join(this.stored(cardKey).path, ATTACHMENT_FOLDER);
  }

  // The stored cards of a location, in tree insertion order.
  private storedIn(location: string): StoredCard[] {
    const cards: StoredCard[] = [];
    for (const cardKey of this.locationIndex.get(location) ?? []) {
      const card = this.cards.get(cardKey);
      if (card) {
        cards.push(card);
      }
    }
    return cards;
  }

  /**
   * Updates, or adds a card to the tree.
   * @param cardKey Card key
   * @param cardData Updated data.
   */
  public updateCard(cardKey: string, cardData: Card) {
    const card = this.cards.get(cardKey);
    if (!card) {
      this.store(cardKey, {
        ...cardData,
        metadata: CardTree.normalizedMetadata(cardData.metadata),
        location: this.locationOf(cardData.path),
      });
      return;
    }
    if (!card?.path) {
      CardTree.logger.info(`Missing path for a card '${cardKey}'`);
      throw new Error(`No path in card!`);
    }
    if (!cardData?.path) {
      CardTree.logger.info(`Missing path for a card data '${cardKey}'`);
      throw new Error(`No path in card data!`);
    }

    this.store(cardKey, {
      ...card, // Existing card data
      ...cardData, // Override with new data
      location: this.locationOf(cardData.path),
      // Explicitly preserve certain data if it exists in the stored card but
      // not in cardData
      metadata: CardTree.normalizedMetadata(cardData.metadata ?? card.metadata),
      content: cardData.content ?? card.content,
      attachments: cardData.attachments ?? card.attachments,
    });
  }

  /**
   * Persists a card's content, and keeps the store in step with it.
   * @param card Card to persist.
   * @returns true if the store was updated; false if the card has no content,
   *   or the tree does not hold it.
   */
  public async writeContent(card: Card): Promise<boolean> {
    if (card.content == null) {
      return false;
    }
    await writeFile(join(card.path, CARD_CONTENT_FILE), card.content);

    const stored = this.cards.get(card.key);
    if (!stored) {
      CardTree.logger.warn(`Card '${card.key}' not found`);
      return false;
    }
    stored.content = card.content;
    return true;
  }

  /**
   * Persists a card's metadata, and keeps the store in step with it. Stamps
   * 'lastUpdated'.
   * @param card Card to persist.
   * @returns true if the store was updated; false if the card has no metadata,
   *   or the tree does not hold it.
   * @throws if the metadata file cannot be written.
   */
  public async writeMetadata(card: Card): Promise<boolean> {
    if (card.metadata == null) {
      return false;
    }
    card.metadata.lastUpdated = new Date().toISOString();

    const sanitizedMetadata = CardTree.sanitizeMetadata(card);
    await writeJsonFile(join(card.path, CARD_METADATA_FILE), sanitizedMetadata);

    const stored = this.cards.get(card.key);
    if (!stored) {
      CardTree.logger.warn(`Card '${card.key}' not found`);
      return false;
    }
    stored.metadata = CardTree.normalizedMetadata(sanitizedMetadata);
    return true;
  }

  /**
   * Deletes a card's folder and its descendants', and drops them from the
   * store. Children go first, so a failure part-way leaves no card whose
   * folder is gone but whose parent's is not.
   * @param cardKey Root of the subtree to delete.
   * @returns true if the card was in the tree; false otherwise.
   */
  public async deleteSubtree(cardKey: string): Promise<boolean> {
    const card = this.cards.get(cardKey);
    if (!card) {
      return false;
    }
    for (const child of this.childrenOf(cardKey)) {
      await this.deleteSubtree(child);
    }
    await deleteDir(card.path);
    return this.unstore(cardKey);
  }

  /**
   * Adds an attachment to a card: writes the file and records it in the store.
   * @param cardKey Card to attach to.
   * @param attachmentName Name for the attachment file.
   * @param attachmentData Buffer to write, or path of a file to copy.
   * @throws CardNotFoundError if the tree does not hold the card; if the
   *   source file cannot be read, or the card already has the file.
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

    this.recordAttachment(cardKey, attachmentFolder, fileName);
  }

  // Records an attachment file in the store.
  private recordAttachment(
    cardKey: string,
    attachmentFolder: string,
    fileName: string,
  ) {
    const card = this.stored(cardKey);
    const attachment: CardAttachment = {
      card: cardKey,
      path: attachmentFolder,
      fileName: fileName,
      mimeType: mime.lookup(fileName) || null,
    };

    const isDuplicate = card.attachments.some(
      (existing) =>
        existing.card === attachment.card &&
        existing.path === attachment.path &&
        existing.fileName === attachment.fileName,
    );
    if (isDuplicate) {
      CardTree.logger.warn(
        `Duplicate attachment prevented: ${attachment.fileName} for card ${cardKey}`,
      );
      return;
    }
    card.attachments.push(attachment);
  }

  /**
   * Removes an attachment from a card: deletes the file and drops it from the
   * store.
   * @param cardKey Card to remove the attachment from.
   * @param fileName Attachment file name to remove.
   * @throws CardNotFoundError if the tree does not hold the card; if the file
   *   name escapes the card's attachment folder, or the file is not there.
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

    const card = this.stored(cardKey);
    card.attachments = card.attachments.filter(
      (attachment) => attachment.fileName !== fileName,
    );
  }

  /**
   * Rewrites the stored paths of a subtree after its folder has moved on disk,
   * so stored paths point at where the files actually are.
   * @param cardKey Root of the subtree to rebase.
   * @param oldBasePath Path prefix the subtree had before the move.
   * @param newBasePath Path prefix it has now.
   */
  public rebaseSubtreePaths(
    cardKey: string,
    oldBasePath: string,
    newBasePath: string,
  ): void {
    const card = this.cards.get(cardKey);
    if (!card) {
      return;
    }

    if (card.path.startsWith(oldBasePath)) {
      this.updateCard(cardKey, {
        ...card,
        path: card.path.replace(oldBasePath, newBasePath),
        attachments: card.attachments.map((attachment) =>
          attachment.path.startsWith(oldBasePath)
            ? {
                ...attachment,
                path: attachment.path.replace(oldBasePath, newBasePath),
              }
            : attachment,
        ),
      });
    }

    for (const childKey of this.childrenOf(cardKey)) {
      this.rebaseSubtreePaths(childKey, oldBasePath, newBasePath);
    }
  }

  /**
   * Loads the cards under a filesystem path into the tree.
   * @param path Folder to load cards from, recursively.
   * @throws DuplicateCardKeyError if a loaded card key is already in the tree
   */
  public async load(path: string): Promise<void> {
    this.populateFromCards(await this.loadEntries(path));
  }

  /**
   * Empties the tree.
   */
  public clear() {
    CardTree.logger.info(`Card tree cleared`);
    this.populated = false;
    this.cards.clear();
    this.childrenIndex.clear();
    this.locationIndex.clear();
  }

  /**
   * Drops a location's cards from the tree.
   * @param location 'project', or a full template name.
   */
  public evictLocation(location: string) {
    for (const cardKey of [...(this.locationIndex.get(location) ?? [])]) {
      this.unstore(cardKey);
    }
  }

  /**
   * Drops every template card from the tree, keeping the project's own cards.
   */
  public evictAllTemplateCards() {
    const templateLocations = [...this.locationIndex.keys()].filter(
      (location) => location !== PROJECT_LOCATION,
    );
    for (const location of templateLocations) {
      this.evictLocation(location);
    }
  }

  /**
   * Reloads one location's cards from disk.
   *
   * Evict before loading: reloaded cards keep their keys and the store rejects
   * a key it already holds.
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
}
