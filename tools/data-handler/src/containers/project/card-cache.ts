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
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';

import type {
  CardMetadata,
  MetadataContent,
} from '../../interfaces/project-interfaces.js';
import { CardNameRegEx } from '../../interfaces/project-interfaces.js';
import { DuplicateCardKeyError } from '../../exceptions/index.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { pathExists } from '../../utils/file-utils.js';

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
 * derived from the edges (see CardTree.pathOf). 'location' is the project or
 * the full name of the template the card belongs to; it is what tells the
 * derivation which folder the card's tree is rooted at.
 */
export interface StoredCard {
  key: string;
  parent: string;
  location: string;
  children: string[];
  metadata?: CardMetadata;
  content?: string;
  attachments: StoredAttachment[];
}

/** A card being stored: its child list is the store's to maintain. */
export type StoredCardInput = Omit<StoredCard, 'children'>;

const cardMetadataFile = 'index.json';
const cardContentFile = 'index.adoc';
const attachmentFolder = 'a';

// The location of cards that are not in a template.
const PROJECT_LOCATION = 'project';

/**
 * The card store: the map of cards, the indexes over it, and the loader that
 * builds it from disk.
 *
 * Not a cache — nothing invalidates it on a timer and nothing falls back to
 * disk on a miss. It is the project's card state, and CardTree is its owner.
 */
export class CardCache {
  private cardCache: Map<string, StoredCard> = new Map();
  // Adjacency index: parent card key (or 'root') -> child card keys. Only
  // parents that have at least one child have an entry, and an entry may be
  // keyed by a card that is not (yet) in the cache, so a card inserted after
  // its children still picks them up.
  private childrenIndex: Map<string, string[]> = new Map();
  // Position of a card key in the cache, assigned on first insert and kept for
  // as long as the card stays cached. Child lists are ordered by it, which is
  // what the deleted full rebuild produced (it read the cache in insertion
  // order), so a parent change cannot reorder unrelated siblings.
  private insertionOrder: Map<string, number> = new Map();
  private nextInsertion: number = 0;
  // Location index: location -> the keys of the cards in it, in cache
  // insertion order. Only non-empty locations have an entry.
  private locationIndex: Map<string, Set<string>> = new Map();
  // Highest insertion position each location has seen, so the common case - a
  // card entering the cache for the first time - can append to its location
  // without inspecting the whole set.
  private locationHighWater: Map<string, number> = new Map();
  // The folder each location's cards are rooted at, registered when the
  // location is created or loaded. This is what makes card paths derivable: a
  // root card's path is its location's root plus its key, and every other
  // card's path is its parent's path plus 'c' plus its key.
  //
  // Kept when a location's cards are evicted: a reload, or a card created
  // straight into an empty template, still needs to know where the location is
  // rooted.
  private locationRoots: Map<string, string> = new Map();
  private cachePopulated: boolean = false;

  // Installs a new child list for a parent, in the index and on the parent
  // card itself (a cached card's 'children' is the very array the index holds,
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
    const parent = this.cardCache.get(parentKey);
    if (parent) {
      parent.children = children;
    }
  }

  // Adds a card to its parent's child list, at the position its cache
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
    // A card entering the cache for the first time has the highest position of
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

  // Adds a card to its location's key set, keeping the set in cache insertion
  // order.
  private addToLocation(cardKey: string, location: string) {
    const position = this.positionOf(cardKey);
    const keys = this.locationIndex.get(location);
    if (!keys) {
      this.locationIndex.set(location, new Set([cardKey]));
      this.locationHighWater.set(location, position);
      return;
    }
    if (position > (this.locationHighWater.get(location) ?? -1)) {
      keys.add(cardKey);
      this.locationHighWater.set(location, position);
      return;
    }
    // A card that changed location (template to template) must not jump to the
    // end of its new location's list; rebuild the set in insertion order.
    this.locationIndex.set(
      location,
      new Set(
        [...keys, cardKey].sort(
          (a, b) => this.positionOf(a) - this.positionOf(b),
        ),
      ),
    );
  }

  // Removes a card from its location's key set.
  private removeFromLocation(cardKey: string, location?: string) {
    if (!location) {
      return;
    }
    const keys = this.locationIndex.get(location);
    if (!keys?.delete(cardKey)) {
      return;
    }
    if (keys.size === 0) {
      this.locationIndex.delete(location);
      this.locationHighWater.delete(location);
    }
  }

  // The only write path into the card map: stores a card and keeps the
  // adjacency and location indexes in step with its 'parent' and 'location'.
  private store(cardKey: string, card: StoredCard) {
    const previous = this.cardCache.get(cardKey);
    if (!previous) {
      this.insertionOrder.set(cardKey, this.nextInsertion++);
    }
    // Children are owned by the index, never by the incoming card object.
    card.children = this.childrenIndex.get(cardKey) ?? [];
    this.cardCache.set(cardKey, card);
    if (previous?.parent !== card.parent) {
      this.detachFromParent(cardKey, previous?.parent);
      this.attachToParent(cardKey, card.parent);
    }
    if (previous?.location !== card.location) {
      this.removeFromLocation(cardKey, previous?.location);
      this.addToLocation(cardKey, card.location);
    }
  }

  // The only removal path out of the card map. The card's own child list stays
  // in the index: its children (if any survive) still name it as their parent.
  private unstore(cardKey: string): boolean {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      return false;
    }
    this.cardCache.delete(cardKey);
    this.insertionOrder.delete(cardKey);
    this.detachFromParent(cardKey, card.parent);
    this.removeFromLocation(cardKey, card.location);
    return true;
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

  // Gets attachments from disk, as file names relative to the card's own
  // attachment folder.
  private async fetchAttachments(
    currentPath: string,
  ): Promise<StoredAttachment[]> {
    const attachmentPath = join(currentPath, attachmentFolder);
    if (!pathExists(attachmentPath)) {
      CardCache.logger.info(`No attachment path for ${currentPath}`);
      return [];
    }

    const fileAttachments = await this.entries(attachmentPath);
    const attachments: StoredAttachment[] = [];
    const seenAttachments = new Set<string>();

    fileAttachments.forEach((attachment) => {
      const dir = relative(attachmentPath, attachment.parentPath);
      const attachmentKey = `${dir}:${attachment.name}`;

      // Skip duplicate attachments based on path and filename
      if (!seenAttachments.has(attachmentKey)) {
        seenAttachments.add(attachmentKey);
        attachments.push({ fileName: attachment.name, dir });
      } else {
        CardCache.logger.warn(
          `Duplicate attachment found during cache population: ${attachment.name} for card ${basename(currentPath)}`,
        );
      }
    });

    return attachments;
  }

  // Gets content from disk.
  private async fetchContent(currentPath: string): Promise<string> {
    return readFile(join(currentPath, cardContentFile), {
      encoding: 'utf-8',
    });
  }

  // Gets metadata from disk.
  private async fetchMetadata(currentPath: string): Promise<string> {
    return readFile(join(currentPath, cardMetadataFile), {
      encoding: 'utf-8',
    });
  }

  // Guarantees invariants the CardMetadata type promises (links is always an
  // array) regardless of how the metadata was produced. Applied to every
  // metadata object entering the cache; on-disk files and in-memory
  // producers may both omit 'links'.
  //
  // Always a fresh, frozen object. Fresh, because the cache must not alias
  // metadata its caller still holds — it used to return the caller's object
  // unchanged whenever 'links' was already present. Frozen, because the
  // metadata-level read (CardTree.nodeView) hands this object straight to its
  // callers rather than cloning it: freezing is what makes that sharing safe,
  // at no cost on the read path. Anything that tries to edit stored metadata
  // now throws instead of silently rewriting the cache.
  private static normalizedMetadata(
    metadata?: CardMetadata,
  ): CardMetadata | undefined {
    if (!metadata) {
      return metadata;
    }
    const stored: Record<string, MetadataContent> = {};
    for (const [key, value] of Object.entries(metadata)) {
      stored[key] = Array.isArray(value) ? CardCache.frozenList(value) : value;
    }
    if (!Array.isArray(stored.links)) {
      stored.links = CardCache.frozenList([]);
    }
    return Object.freeze(stored) as CardMetadata;
  }

  // A frozen copy of a metadata array, with its object elements frozen too:
  // 'links' and 'externalLinks' hold objects, and a frozen array whose
  // elements are writable would still let a reader edit the cache.
  private static frozenList(values: unknown[]): MetadataContent {
    return Object.freeze(
      values.map((item) =>
        item !== null && typeof item === 'object'
          ? Object.freeze({ ...item })
          : item,
      ),
    ) as MetadataContent;
  }

  // Reads every card under a location's root folder.
  //
  // A card's parent comes from where its folder sits, not from a parser over
  // the path string: a folder directly under the root is a root card, and
  // anything else sits in its parent's 'c' folder.
  private async fetchFileEntries(
    rootPath: string,
    location: string,
  ): Promise<StoredCardInput[]> {
    const root = resolve(rootPath);
    const allEntries = await this.entries(rootPath);
    const cardEntries = allEntries.filter(
      (entry) => entry.isDirectory() && CardNameRegEx.test(entry.name),
    );

    // Process all card entries in parallel
    const cardPromises = cardEntries.map(async (entry) => {
      const currentPath = join(entry.parentPath, entry.name);
      const parentFolder = resolve(entry.parentPath);
      const parent =
        parentFolder === root ? ROOT : basename(dirname(parentFolder));

      const [cardContent, cardMetadata, cardAttachments] = await Promise.all([
        this.fetchContent(currentPath),
        this.fetchMetadata(currentPath),
        this.fetchAttachments(currentPath),
      ]);

      let metadata;
      try {
        metadata = JSON.parse(cardMetadata);
      } catch (error) {
        const metadataPath = join(currentPath, cardMetadataFile);
        CardCache.logger.error(
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
        attachments: cardAttachments,
        content: cardContent,
        metadata: CardCache.normalizedMetadata(metadata),
        parent,
        location,
      };
    });

    // Wait for all cards to be processed and add them to the cards array
    return Promise.all(cardPromises);
  }

  // Populates the cache from the given array of cards
  private populateFromCards(cards: StoredCardInput[]) {
    // Card keys must be unique across the whole cache, not just within this
    // batch. The project cards and each template's cards arrive as separate
    // batches merged into one map, so checking only the incoming batch let a
    // key that collided across batches overwrite the entry already there —
    // one of the two cards simply vanished from the cache.
    const duplicates: string[] = [];
    const batchKeys = new Set<string>();
    for (const card of cards) {
      if (
        (batchKeys.has(card.key) || this.cardCache.has(card.key)) &&
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
      this.put(card);
    }

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

    // Check for duplicate attachments based on folder and filename
    const isDuplicate = card.attachments.some(
      (existing) => existing.dir === '' && existing.fileName === fileName,
    );
    if (isDuplicate) {
      CardCache.logger.warn(
        `Duplicate attachment prevented: ${fileName} for card ${cardKey}`,
      );
      return false;
    }

    card.attachments = [...card.attachments, { fileName, dir: '' }];
    return true;
  }

  /**
   * Empties the cache.
   */
  public clear() {
    CardCache.logger.info(`Card cache cleared`);
    this.cachePopulated = false;
    this.cardCache.clear();
    this.childrenIndex.clear();
    this.insertionOrder.clear();
    this.nextInsertion = 0;
    this.locationIndex.clear();
    this.locationHighWater.clear();
    this.locationRoots.clear();
  }

  /**
   * Removes a card from the cache.
   * @param cardKey card key to remove
   * @returns true, if card was removed from the cache; false otherwise
   */
  public deleteCard(cardKey: string) {
    return this.unstore(cardKey);
  }

  /**
   * Removes attachment from a card in the cache.
   * @param cardKey card key of card from which attachment is to be removed
   * @param filename attachment filename to remove
   * @returns true, if attachment was removed from the cache; false otherwise
   */
  public deleteAttachment(cardKey: string, filename: string): boolean {
    const card = this.cardCache.get(cardKey);
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
   * Renames an attachment of a card in the cache.
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
    const card = this.cardCache.get(cardKey);
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
   * Removes template's cards from the cache.
   * @param templateName Name of the template
   */
  public deleteCardsFromTemplate(templateName: string) {
    for (const cardKey of this.keysAtLocation(templateName)) {
      this.deleteCard(cardKey);
    }
  }

  /**
   * Removes all template cards (i.e. cards whose location is not 'project') from the cache.
   */
  public deleteAllTemplateCards() {
    const templateLocations = [...this.locationIndex.keys()].filter(
      (location) => location !== PROJECT_LOCATION,
    );
    for (const location of templateLocations) {
      this.deleteCardsFromTemplate(location);
    }
  }

  /**
   * Returns all the template cards in the cache.
   * @returns all the template cards in the cache.
   * @note Deliberately a scan rather than a walk of the location index: the
   *   result is every template card, so the index would save no asymptotic
   *   work, and the scan keeps the cards in global cache order - which callers
   *   that concatenate them after the project cards depend on.
   */
  public getAllTemplateCards(): StoredCard[] {
    return Array.from(this.cardCache.values()).filter(
      (item) => item.location !== PROJECT_LOCATION,
    );
  }

  /**
   * Returns the cards in a given location.
   * @param location 'project', or a full template name.
   * @returns the cards in that location, in cache insertion order.
   */
  public cardsAtLocation(location: string): StoredCard[] {
    const cards: StoredCard[] = [];
    for (const cardKey of this.locationIndex.get(location) ?? []) {
      const card = this.cardCache.get(cardKey);
      if (card) {
        cards.push(card);
      }
    }
    return cards;
  }

  /**
   * Returns how many cards a given location holds.
   * @param location 'project', or a full template name.
   * @returns the number of cards in that location.
   */
  public cardCountAtLocation(location: string): number {
    return this.locationIndex.get(location)?.size ?? 0;
  }

  /**
   * Returns the card keys in a given location.
   * @param location 'project', or a full template name.
   * @returns the card keys in that location, in cache insertion order.
   */
  public keysAtLocation(location: string): string[] {
    return [...(this.locationIndex.get(location) ?? [])];
  }

  /**
   * Returns a card from the cache.
   * @param cardKey card key to find
   * @returns card from the cache; if not found then returns undefined.
   */
  public getCard(cardKey: string): StoredCard | undefined {
    return this.cardCache.get(cardKey);
  }

  /**
   * Returns all the cards in the cache.
   * @returns all the cards in the cache
   */
  public getCards(): StoredCard[] {
    return Array.from(this.cardCache.values());
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
   * Checks if cache has been already populated.
   * @returns true if cache has already been populated; otherwise false
   */
  public get isPopulated(): boolean {
    return this.cachePopulated;
  }

  /**
   * Returns the child card keys of a given card.
   * @param cardKey Card key whose children to return.
   * @returns child card keys, in cache insertion order.
   */
  public childrenOf(cardKey: string): string[] {
    return this.childrenIndex.get(cardKey) ?? [];
  }

  /**
   * The folder a location's cards are rooted at.
   * @param location 'project', or a full template name.
   * @returns the location's root folder, or undefined if it is not loaded.
   */
  public rootOf(location: string): string | undefined {
    return this.locationRoots.get(location);
  }

  /**
   * Registers the folder a location's cards are rooted at.
   * @param location 'project', or a full template name.
   * @param rootPath Folder the location's cards live in.
   */
  public registerRoot(location: string, rootPath: string) {
    this.locationRoots.set(location, resolve(rootPath));
  }

  /**
   * The location a filesystem path belongs to.
   * @param path Path of a card, or of a folder holding cards.
   * @returns the location whose root folder contains the path.
   * @throws if the path is not inside any loaded location
   */
  public locationForPath(path: string): string {
    const target = resolve(path);
    let match: { location: string; length: number } | undefined;
    for (const [location, root] of this.locationRoots) {
      if (target !== root && !target.startsWith(root + sep)) {
        continue;
      }
      if (!match || root.length > match.length) {
        match = { location, length: root.length };
      }
    }
    if (!match) {
      throw new Error(`Path '${path}' is not part of any loaded card location`);
    }
    return match.location;
  }

  /**
   * Loads a location's cards from the given folder.
   * @param rootPath Folder the location's cards live in.
   * @param location 'project', or a full template name.
   * @throws DuplicateCardKeyError if a loaded key is already in the cache
   */
  public async populateFromPath(rootPath: string, location: string) {
    this.registerRoot(location, rootPath);
    const cards = await this.fetchFileEntries(rootPath, location);
    this.populateFromCards(cards);
  }

  /**
   * Stores a card, inserting it if the cache does not hold it yet.
   * @param card Card to store.
   */
  public put(card: StoredCardInput) {
    this.store(card.key, {
      ...card,
      metadata: CardCache.normalizedMetadata(card.metadata),
      children: [],
    });
  }

  /**
   * Moves a card to a new position in the tree.
   *
   * Descendants need no update: their paths are derived from this card's, and
   * their location follows it here.
   * @param cardKey Card to move.
   * @param parent New parent card key, or 'root'.
   * @param location Location the card now belongs to.
   * @returns true, if the card was in the cache; false otherwise.
   */
  public relocate(cardKey: string, parent: string, location: string): boolean {
    const card = this.cardCache.get(cardKey);
    if (!card) {
      return false;
    }
    this.store(cardKey, { ...card, parent, location });
    if (card.location !== location) {
      for (const childKey of this.childrenOf(cardKey)) {
        this.relocate(childKey, cardKey, location);
      }
    }
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
    card.metadata = CardCache.normalizedMetadata(metadata);
    return true;
  }
}
