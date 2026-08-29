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
import { basename, dirname, join, resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

import type {
  CardMetadata,
  MetadataContent,
} from '../../interfaces/project-interfaces.js';
import { CardNameRegEx } from '../../interfaces/project-interfaces.js';
import { getChildLogger } from '../../utils/log-utils.js';

import { ROOT } from '../../utils/constants.js';

/**
 * An attachment as the store holds it: the file's name, and the folder it sits
 * in relative to its card's attachment folder (empty for the common case).
 *
 * No path: an attachment's path is its card's path plus 'a', and the card's
 * path is derived from the tree's edges. Storing it made a second source of
 * truth that every folder move had to remember to rewrite.
 */
export interface StoredAttachment {
  fileName: string;
  dir: string;
}

/**
 * A card as the store holds it: identity, tree position, and the card's own
 * data.
 *
 * Neither the card's path nor its attachments' paths are stored — both are
 * derived from the edges and the store's root folder (see CardTree.pathOf).
 */
export interface StoredCard {
  key: string;
  parent: string;
  children: string[];
  metadata?: CardMetadata;
  content?: string;
  // Whether 'content' is the card's content or just the absence of a read.
  // A card is loaded without its content - nothing about a card's facts is
  // built from it - and the file is read the first time somebody asks. The
  // flag is what keeps 'no content' and 'not read yet' apart.
  contentRead: boolean;
  attachments: StoredAttachment[];
}

/** A card being stored: its child list is the store's to maintain. */
export type StoredCardInput = Omit<StoredCard, 'children'>;

const cardMetadataFile = 'index.json';
const attachmentFolder = 'a';

/**
 * The card store of one card tree: the map of its cards, the adjacency index
 * over them, and the loader that builds both from disk.
 *
 * Not a cache — nothing invalidates it on a timer and nothing falls back to
 * disk on a miss. It is the tree's state, and CardTree is its owner.
 */
export class CardStore {
  private storedCards: Map<string, StoredCard> = new Map();
  // Adjacency index: parent card key (or 'root') -> child card keys. Only
  // parents that have at least one child have an entry, and an entry may be
  // keyed by a card that is not (yet) in the store, so a card inserted after
  // its children still picks them up.
  private childrenIndex: Map<string, string[]> = new Map();
  // Position of a card key in the store, assigned on first insert and kept for
  // as long as the card stays stored. Child lists are ordered by it, which is
  // what the deleted full rebuild produced (it read the store in insertion
  // order), so a parent change cannot reorder unrelated siblings.
  private insertionOrder: Map<string, number> = new Map();
  private nextInsertion: number = 0;
  private populated: boolean = false;

  /**
   * @param rootPath Folder this store's cards are rooted at. This is what makes
   *   card paths derivable: a root card's path is the root plus its key, and
   *   every other card's path is its parent's path plus 'c' plus its key.
   */
  constructor(private rootPath: string) {}

  // Installs a new child list for a parent, in the index and on the parent
  // card itself (a stored card's 'children' is the very array the index holds,
  // so the two cannot drift). Replacing the array rather than mutating it is
  // required whenever a child is removed: callers walk a parent's child list
  // while removing cards from it (handleCardDeleted and removeCard both do),
  // and must keep seeing the snapshot they started with.
  private setChildren(parentKey: string, children: string[]) {
    if (children.length === 0) {
      this.childrenIndex.delete(parentKey);
    } else {
      this.childrenIndex.set(parentKey, children);
    }
    const parent = this.storedCards.get(parentKey);
    if (parent) {
      parent.children = children;
    }
  }

  // Adds a card to its parent's child list, at the position its store
  // insertion order dictates. Only called when the card's parent actually
  // changed, so the card is never already in the list.
  private attachToParent(cardKey: string, parentKey?: string) {
    if (!parentKey) {
      return;
    }
    const siblings = this.childrenIndex.get(parentKey);
    if (!siblings) {
      this.setChildren(parentKey, [cardKey]);
      return;
    }
    const position = this.positionOf(cardKey);
    // A card entering the store for the first time has the highest position of
    // all its siblings, so it appends - in place, which keeps populating a flat
    // tree linear instead of quadratic. Only a card that changed parent can
    // land mid-list, and that case pays for a copy.
    if (position > this.positionOf(siblings[siblings.length - 1])) {
      siblings.push(cardKey);
      return;
    }
    const at = siblings.findIndex(
      (sibling) => this.positionOf(sibling) > position,
    );
    const updated = [...siblings];
    updated.splice(at === -1 ? updated.length : at, 0, cardKey);
    this.setChildren(parentKey, updated);
  }

  // Removes a card from its parent's child list.
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

  private positionOf(cardKey: string): number {
    return this.insertionOrder.get(cardKey) ?? Number.MAX_SAFE_INTEGER;
  }

  // The only write path into the card map: stores a card and keeps the
  // adjacency index in step with its 'parent'.
  private store(cardKey: string, card: StoredCard) {
    const previous = this.storedCards.get(cardKey);
    if (!previous) {
      this.insertionOrder.set(cardKey, this.nextInsertion++);
    }
    // Children are owned by the index, never by the incoming card object.
    card.children = this.childrenIndex.get(cardKey) ?? [];
    this.storedCards.set(cardKey, card);
    if (previous?.parent !== card.parent) {
      this.detachFromParent(cardKey, previous?.parent);
      this.attachToParent(cardKey, card.parent);
    }
  }

  // The only removal path out of the card map. The card's own child list stays
  // in the index: its children (if any survive) still name it as their parent.
  private unstore(cardKey: string): boolean {
    const card = this.storedCards.get(cardKey);
    if (!card) {
      return false;
    }
    this.storedCards.delete(cardKey);
    this.insertionOrder.delete(cardKey);
    this.detachFromParent(cardKey, card.parent);
    return true;
  }

  // Gets all directory entries recursively.
  private async entries(path: string): Promise<Dirent[]> {
    try {
      return await readdir(path, { withFileTypes: true, recursive: true });
    } catch (error) {
      CardStore.logger.error({ error }, 'Reading entries');
      return [];
    }
  }

  // Every card's attachment listing, taken out of the listing the load already
  // has.
  //
  // The recursive sweep over the tree root has already returned every 'a'
  // folder and everything in it, so going back to disk per card - a
  // synchronous existsSync plus a readdir, N times - was reading the same
  // directories a second time.
  private static attachmentsByCard(
    allEntries: Dirent[],
    cardFolders: Map<string, string>,
    root: string,
  ): Map<string, StoredAttachment[]> {
    const attachments = new Map<string, StoredAttachment[]>();
    const seen = new Set<string>();

    for (const entry of allEntries) {
      const position = CardStore.attachmentPosition(entry, cardFolders, root);
      if (!position) {
        continue;
      }
      const { cardKey, dir } = position;
      const attachmentKey = `${cardKey}:${dir}:${entry.name}`;
      if (seen.has(attachmentKey)) {
        CardStore.logger.warn(
          `Duplicate attachment found while loading the store: ${entry.name} for card ${cardKey}`,
        );
        continue;
      }
      seen.add(attachmentKey);
      const listing = attachments.get(cardKey);
      if (listing) {
        listing.push({ fileName: entry.name, dir });
      } else {
        attachments.set(cardKey, [{ fileName: entry.name, dir }]);
      }
    }

    return attachments;
  }

  // Which card an entry is an attachment of, and where it sits relative to
  // that card's attachment folder — or undefined when the entry is not inside
  // one. Walks the entry's folder up to the tree root looking for an 'a'
  // folder that belongs to a card.
  private static attachmentPosition(
    entry: Dirent,
    cardFolders: Map<string, string>,
    root: string,
  ): { cardKey: string; dir: string } | undefined {
    let dir = '';
    let folder = resolve(entry.parentPath);
    while (folder !== root) {
      const name = basename(folder);
      const parent = dirname(folder);
      if (parent === folder) {
        return undefined;
      }
      if (name === attachmentFolder) {
        const cardKey = cardFolders.get(parent);
        if (cardKey) {
          return { cardKey, dir };
        }
      }
      dir = dir === '' ? name : join(name, dir);
      folder = parent;
    }
    return undefined;
  }

  // Gets metadata from disk.
  private async fetchMetadata(currentPath: string): Promise<string> {
    return readFile(join(currentPath, cardMetadataFile), {
      encoding: 'utf-8',
    });
  }

  // Guarantees invariants the CardMetadata type promises (links is always an
  // array) regardless of how the metadata was produced. Applied to every
  // metadata object entering the store; on-disk files and in-memory
  // producers may both omit 'links'.
  //
  // Always a fresh, frozen object. Fresh, because the store must not alias
  // metadata its caller still holds — it used to return the caller's object
  // unchanged whenever 'links' was already present. Frozen, because the
  // metadata-level read (CardTree.nodeView) hands this object straight to its
  // callers rather than cloning it: freezing is what makes that sharing safe,
  // at no cost on the read path. Anything that tries to edit stored metadata
  // now throws instead of silently rewriting the store.
  private static normalizedMetadata(
    metadata?: CardMetadata,
  ): CardMetadata | undefined {
    if (!metadata) {
      return metadata;
    }
    const stored: Record<string, MetadataContent> = {};
    for (const [key, value] of Object.entries(metadata)) {
      stored[key] = Array.isArray(value) ? CardStore.frozenList(value) : value;
    }
    if (!Array.isArray(stored.links)) {
      stored.links = CardStore.frozenList([]);
    }
    return Object.freeze(stored) as CardMetadata;
  }

  // A frozen copy of a metadata array, with its object elements frozen too:
  // 'links' and 'externalLinks' hold objects, and a frozen array whose
  // elements are writable would still let a reader edit the store.
  private static frozenList(values: unknown[]): MetadataContent {
    return Object.freeze(
      values.map((item) =>
        item !== null && typeof item === 'object'
          ? Object.freeze({ ...item })
          : item,
      ),
    ) as MetadataContent;
  }

  // Reads every card under the store's root folder.
  //
  // A card's parent comes from where its folder sits, not from a parser over
  // the path string: a folder directly under the root is a root card, and
  // anything else sits in its parent's 'c' folder.
  private async fetchFileEntries(): Promise<StoredCardInput[]> {
    const root = resolve(this.rootPath);
    const allEntries = await this.entries(this.rootPath);
    const cardEntries = allEntries.filter(
      (entry) => entry.isDirectory() && CardNameRegEx.test(entry.name),
    );

    // Card folder -> card key, so that an entry can be traced back to the card
    // whose attachment folder it sits in.
    const cardFolders = new Map<string, string>(
      cardEntries.map((entry) => [
        resolve(join(entry.parentPath, entry.name)),
        entry.name,
      ]),
    );
    const attachments = CardStore.attachmentsByCard(
      allEntries,
      cardFolders,
      root,
    );

    // Process all card entries in parallel
    const cardPromises = cardEntries.map(async (entry) => {
      const currentPath = join(entry.parentPath, entry.name);
      const parentFolder = resolve(entry.parentPath);
      const parent =
        parentFolder === root ? ROOT : basename(dirname(parentFolder));

      const cardMetadata = await this.fetchMetadata(currentPath);

      let metadata;
      try {
        metadata = JSON.parse(cardMetadata);
      } catch (error) {
        const metadataPath = join(currentPath, cardMetadataFile);
        CardStore.logger.error(
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
        attachments: attachments.get(entry.name) ?? [],
        contentRead: false,
        metadata: CardStore.normalizedMetadata(metadata),
        parent,
      };
    });

    // Wait for all cards to be processed and add them to the cards array
    return Promise.all(cardPromises);
  }

  // Fills the store from the given array of cards
  private populateFromCards(cards: StoredCardInput[]) {
    for (const card of cards) {
      this.put(card);
    }

    this.populated = true;
    CardStore.logger.info(`Card store populated`);
  }

  // Returns instance of logger.
  private static get logger() {
    return getChildLogger({
      module: 'cardStore',
    });
  }

  /**
   * Adds attachment to a card in the store.
   * @param cardKey card key for which to add new attachment
   * @param fileName attachment fileName
   * @returns true, if attachment was added to the store; false otherwise.
   */
  public addAttachment(cardKey: string, fileName: string) {
    const card = this.storedCards.get(cardKey);
    if (!card) {
      CardStore.logger.warn(
        `Cannot add attachment to card '${cardKey}. Card does not exist.'`,
      );
      return false;
    }

    // Check for duplicate attachments based on folder and filename
    const isDuplicate = card.attachments.some(
      (existing) => existing.dir === '' && existing.fileName === fileName,
    );
    if (isDuplicate) {
      CardStore.logger.warn(
        `Duplicate attachment prevented: ${fileName} for card ${cardKey}`,
      );
      return false;
    }

    card.attachments = [...card.attachments, { fileName, dir: '' }];
    return true;
  }

  /**
   * Empties the store.
   */
  public clear() {
    CardStore.logger.info(`Card store cleared`);
    this.populated = false;
    this.storedCards.clear();
    this.childrenIndex.clear();
    this.insertionOrder.clear();
    this.nextInsertion = 0;
  }

  /**
   * Removes a card from the store.
   * @param cardKey card key to remove
   * @returns true, if card was removed from the store; false otherwise
   */
  public deleteCard(cardKey: string) {
    return this.unstore(cardKey);
  }

  /**
   * Removes attachment from a card in the store.
   * @param cardKey card key of card from which attachment is to be removed
   * @param filename attachment filename to remove
   * @returns true, if attachment was removed from the store; false otherwise
   */
  public deleteAttachment(cardKey: string, filename: string): boolean {
    const card = this.storedCards.get(cardKey);
    if (!card) {
      return false;
    }
    const remaining = card.attachments.filter(
      (attachment) => attachment.fileName !== filename,
    );
    const removed = remaining.length !== card.attachments.length;
    card.attachments = remaining;
    return removed;
  }

  /**
   * Renames an attachment of a card in the store.
   * @param cardKey card key of the card holding the attachment
   * @param fileName current attachment file name
   * @param newFileName new attachment file name
   * @returns true, if the attachment was renamed; false otherwise
   */
  public renameAttachment(
    cardKey: string,
    fileName: string,
    newFileName: string,
  ): boolean {
    const card = this.storedCards.get(cardKey);
    const attachment = card?.attachments.find(
      (item) => item.fileName === fileName,
    );
    if (!card || !attachment) {
      return false;
    }
    // A new array, not a mutation in place: attachment listings handed out to
    // callers are copies, but the array itself must not be shared with a
    // reader that is iterating it.
    card.attachments = card.attachments.map((item) =>
      item === attachment ? { ...item, fileName: newFileName } : item,
    );
    return true;
  }

  /**
   * Returns the cards in the store, in insertion order.
   */
  public cards(): StoredCard[] {
    return Array.from(this.storedCards.values());
  }

  /**
   * How many cards the store holds.
   */
  public get count(): number {
    return this.storedCards.size;
  }

  /**
   * The card keys in the store, in insertion order.
   */
  public keys(): string[] {
    return Array.from(this.storedCards.keys());
  }

  /**
   * Returns a card from the store.
   * @param cardKey card key to find
   * @returns card from the store; if not found then returns undefined.
   */
  public getCard(cardKey: string): StoredCard | undefined {
    return this.storedCards.get(cardKey);
  }

  /**
   * Checks if the store holds a card.
   * @param cardKey card key to check
   * @returns true if the store holds the card; false otherwise
   */
  public hasCard(cardKey: string): boolean {
    return this.storedCards.has(cardKey);
  }

  /**
   * Checks if the store has been loaded.
   * @returns true if the store has been loaded; otherwise false
   */
  public get isPopulated(): boolean {
    return this.populated;
  }

  /**
   * Returns the child card keys of a given card.
   * @param cardKey Card key whose children to return.
   * @returns child card keys, in store insertion order.
   */
  public childrenOf(cardKey: string): string[] {
    return this.childrenIndex.get(cardKey) ?? [];
  }

  /**
   * The folder this store's cards are rooted at.
   */
  public get root(): string {
    return this.rootPath;
  }

  /**
   * Points the store at another root folder, e.g. after its template's folder
   * has been renamed. Card paths are derived, so nothing stored has to change.
   * @param rootPath The store's new root folder.
   */
  public rebase(rootPath: string) {
    this.rootPath = rootPath;
  }

  /**
   * Loads the store's cards from its root folder.
   * @returns the loaded cards.
   */
  public async populate(): Promise<StoredCard[]> {
    const cards = await this.fetchFileEntries();
    this.populateFromCards(cards);
    return cards.map((card) => this.storedCards.get(card.key)!);
  }

  /**
   * Stores a card, inserting it if the store does not hold it yet.
   * @param card Card to store.
   */
  public put(card: StoredCardInput) {
    this.store(card.key, {
      ...card,
      metadata: CardStore.normalizedMetadata(card.metadata),
      children: [],
    });
  }

  /**
   * Moves a card to a new position in the tree.
   *
   * Descendants need no update: their paths are derived from this card's.
   * @param cardKey Card to move.
   * @param parent New parent card key, or 'root'.
   * @returns true, if the card was in the store; false otherwise.
   */
  public relocate(cardKey: string, parent: string): boolean {
    const card = this.storedCards.get(cardKey);
    if (!card) {
      return false;
    }
    this.store(cardKey, { ...card, parent });
    return true;
  }

  /**
   * Updates card's content in the store.
   * @param cardKey card key of a card to update.
   * @param content New content for the card.
   * @returns true, if update succeeded; false otherwise.
   */
  public updateCardContent(cardKey: string, content: string) {
    const card = this.storedCards.get(cardKey);
    if (!card) {
      CardStore.logger.warn(`Card '${cardKey}' not found`);
      return false;
    }
    card.content = content;
    card.contentRead = true;
    return true;
  }

  /**
   * Updates card's metadata in the store.
   * @param cardKey card key of a card to update.
   * @param metadata New metadata for the card.
   * @returns true, if update succeeded; false otherwise.
   */
  public updateCardMetadata(cardKey: string, metadata: CardMetadata) {
    const card = this.storedCards.get(cardKey);
    if (!card) {
      CardStore.logger.warn(`Card '${cardKey}' not found`);
      return false;
    }
    card.metadata = CardStore.normalizedMetadata(metadata);
    return true;
  }
}
