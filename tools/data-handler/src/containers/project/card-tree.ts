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
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
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
import { CardNotFoundError } from '../../exceptions/index.js';
import { deleteDir, pathExists } from '../../utils/file-utils.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { writeJsonFile } from '../../utils/json.js';
import { isPredefinedField, ROOT } from '../../utils/constants.js';

import type { CardFactContext } from '../../utils/clingo-facts.js';
import type { CardKeyRegistry } from './card-keys.js';

// An attachment as the tree stores it: the file's name, and the folder it
// sits in relative to its card's attachment folder (empty for the common
// case). Its full path is derived from its card's.
interface StoredAttachment {
  fileName: string;
  dir: string;
}

// A card as the tree stores it: identity, tree position and the card's own
// data. No path: a card's folder is derived from the edges and the tree's
// root folder (see pathOf).
export interface StoredCard {
  key: string;
  parent: string;
  children: string[];
  metadata?: CardMetadata;
  content?: string;
  attachments: StoredAttachment[];
}

// A card's own files, inside its folder.
const CARD_CONTENT_FILE = 'index.adoc';
const CARD_METADATA_FILE = 'index.json';
// A card's attachment folder, inside its folder.
const ATTACHMENT_FOLDER = 'a';
// A card's children live in this folder, inside its folder.
const CHILDREN_FOLDER = 'c';

/**
 * How one card tree differs from another.
 *
 * name - the tree's identity: 'project', or a template's full resource name.
 * rootPath - the folder the tree's cards are rooted at.
 * writable - whether the tree accepts writes.
 * emitsCardFact - whether the tree's cards get the card(Key) fact.
 * validationApplies - whether the tree's cards take part in workflow
 *   semantics: metadata validation, and the permissions built on it.
 * keys - the project-level card key registry.
 */
export interface CardTreeOptions {
  name: string;
  rootPath: string;
  writable: boolean;
  emitsCardFact: boolean;
  validationApplies: boolean;
  keys: CardKeyRegistry;
}

/**
 * Owner of one container's cards: their storage, their structure, their
 * indexes and their filesystem representation. Knows nothing about workflows,
 * card types or clingo.
 *
 * Card paths are derived from the edges, never stored.
 *
 * Reads return their elements in unspecified but stable order: the order does
 * not change between reads of a tree that was not mutated. A caller that
 * needs a particular order sorts for it.
 */
export class CardTree {
  private cardStore: Map<string, StoredCard> = new Map();
  private childrenIndex: Map<string, string[]> = new Map();
  private populated: boolean = false;
  private treeName: string;
  private treeRoot: string;

  constructor(private readonly options: CardTreeOptions) {
    this.treeName = options.name;
    this.treeRoot = options.rootPath;
  }

  private setChildren(parentKey: string, children: string[]) {
    if (children.length === 0) {
      this.childrenIndex.delete(parentKey);
    } else {
      this.childrenIndex.set(parentKey, children);
    }
    const parent = this.cardStore.get(parentKey);
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

  private store(cardKey: string, card: StoredCard) {
    const previous = this.cardStore.get(cardKey);
    card.children = this.childrenIndex.get(cardKey) ?? [];
    this.cardStore.set(cardKey, card);
    if (previous?.parent !== card.parent) {
      this.detachFromParent(cardKey, previous?.parent);
      this.attachToParent(cardKey, card.parent);
    }
  }

  private unstore(cardKey: string): boolean {
    const card = this.cardStore.get(cardKey);
    if (!card) {
      return false;
    }
    this.cardStore.delete(cardKey);
    this.detachFromParent(cardKey, card.parent);
    return true;
  }

  // The stored card, or a CardNotFoundError.
  private stored(cardKey: string): StoredCard {
    const card = this.cardStore.get(cardKey);
    if (!card) {
      throw new CardNotFoundError(cardKey);
    }
    return card;
  }

  // Module trees refuse writes; command-layer checks are courtesy errors.
  private assertWritable() {
    if (!this.options.writable) {
      throw new Error(`Cannot modify imported module`);
    }
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

  // Identity and tree position. The frozen metadata is shared with the store;
  // 'children' is copied.
  private nodeView(card: StoredCard): CardNode {
    return {
      key: card.key,
      path: this.pathOfStored(card),
      children: [...card.children],
      metadata: card.metadata,
      parent: card.parent,
    };
  }

  // The fully hydrated card: identity, tree position, and copies of everything
  // a caller might modify.
  private cardView(card: StoredCard): Card {
    const path = this.pathOfStored(card);
    return {
      key: card.key,
      path,
      children: [...card.children],
      parent: card.parent,
      metadata: structuredClone(card.metadata),
      content: card.content,
      attachments: card.attachments.map((attachment) =>
        CardTree.attachmentView(card.key, path, attachment),
      ),
    };
  }

  // An attachment as callers see it: its folder and its mime type are derived
  // from the card's path and the file's name.
  private static attachmentView(
    cardKey: string,
    cardPath: string,
    attachment: StoredAttachment,
  ): CardAttachment {
    return {
      card: cardKey,
      path: join(cardPath, ATTACHMENT_FOLDER, attachment.dir),
      fileName: attachment.fileName,
      mimeType: mime.lookup(attachment.fileName) || null,
    };
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
  ): Map<string, StoredAttachment[]> {
    const attachments = new Map<string, StoredAttachment[]>();
    const seen = new Set<string>();

    for (const entry of allEntries) {
      const owner = CardTree.attachmentOwner(entry, cardFolders, root);
      if (!owner) {
        continue;
      }
      const dir = relative(owner.attachmentFolder, entry.parentPath);
      const attachmentKey = `${owner.cardKey}:${dir}:${entry.name}`;
      if (seen.has(attachmentKey)) {
        CardTree.logger.warn(
          `Duplicate attachment found during cache population: ${entry.name} for card ${owner.cardKey}`,
        );
        continue;
      }
      seen.add(attachmentKey);
      const attachment: StoredAttachment = { fileName: entry.name, dir };
      const listing = attachments.get(owner.cardKey);
      if (listing) {
        listing.push(attachment);
      } else {
        attachments.set(owner.cardKey, [attachment]);
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
  ): { cardKey: string; attachmentFolder: string } | undefined {
    let folder = resolve(entry.parentPath);
    while (folder !== root) {
      const parent = dirname(folder);
      if (parent === folder) {
        return undefined;
      }
      if (basename(folder) === ATTACHMENT_FOLDER) {
        const cardKey = cardFolders.get(parent);
        if (cardKey) {
          return { cardKey, attachmentFolder: folder };
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

  // Reads the cards under the tree's root folder from disk. A card's parent
  // comes from where its folder sits: directly under the root it is a root
  // card, anywhere else it is in its parent's 'c' folder.
  private async loadEntries(): Promise<StoredCard[]> {
    const root = resolve(this.treeRoot);
    const allEntries = await this.entries(this.treeRoot);
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
      root,
    );
    const loadedKeys = new Set(cardEntries.map((entry) => entry.name));

    const cardPromises = cardEntries.map(async (entry) => {
      const currentPath = join(entry.parentPath, entry.name);
      const parentFolder = resolve(entry.parentPath);
      const parent =
        parentFolder === root ? ROOT : basename(dirname(parentFolder));
      // A card folder reached through anything but a card's 'c' folder has no
      // parent to derive its path from, so the load refuses it by name.
      if (
        parent !== ROOT &&
        (basename(parentFolder) !== CHILDREN_FOLDER || !loadedKeys.has(parent))
      ) {
        throw new Error(
          `Card folder '${currentPath}' is not inside a card's '${CHILDREN_FOLDER}' folder`,
        );
      }

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
        children: [],
        attachments: attachments.get(entry.name) ?? [],
        content: cardContent,
        metadata: CardTree.normalizedMetadata(metadata),
        parent,
      };
    });

    return Promise.all(cardPromises);
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
   * The tree's identity: 'project', or a template's full resource name.
   */
  public get name(): string {
    return this.treeName;
  }

  /**
   * The folder the tree's cards are rooted at.
   */
  public get rootPath(): string {
    return this.treeRoot;
  }

  /**
   * Whether the tree's cards take part in workflow semantics: metadata
   * validation, and the permissions built on it.
   */
  public get validationApplies(): boolean {
    return this.options.validationApplies;
  }

  /**
   * How the tree's cards are projected into clingo facts.
   */
  public get factContext(): CardFactContext {
    return { emitsCardFact: this.options.emitsCardFact, name: this.treeName };
  }

  /**
   * Points the tree at another name and root folder, after its container has
   * been renamed on disk.
   */
  public rebase(name: string, rootPath: string) {
    this.treeName = name;
    this.treeRoot = rootPath;
  }

  /**
   * The child card keys of a card.
   * @param cardKey Card key whose children to return.
   * @returns child card keys.
   */
  public childrenOf(cardKey: string): string[] {
    return [...(this.childrenIndex.get(cardKey) ?? [])];
  }

  /**
   * The keys of a card's ancestors, nearest first.
   * @param cardKey Card key whose ancestors to return.
   */
  public ancestorsOf(cardKey: string): string[] {
    const ancestors: string[] = [];
    let card = this.cardStore.get(cardKey);
    while (card && card.parent !== ROOT) {
      ancestors.push(card.parent);
      card = this.cardStore.get(card.parent);
    }
    return ancestors;
  }

  /**
   * Whether the tree holds a card.
   * @param cardKey Card key to check.
   */
  public has(cardKey: string): boolean {
    return this.cardStore.has(cardKey);
  }

  /**
   * The folder a card's own files live in.
   * @param cardKey Card key to locate.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public pathOf(cardKey: string): string {
    return this.pathOfStored(this.stored(cardKey));
  }

  // The folder a stored card's files live in, walked out of the edges.
  private pathOfStored(card: StoredCard): string {
    const segments: string[] = [];
    let current: StoredCard = card;
    while (current.parent !== ROOT) {
      segments.push(current.key, CHILDREN_FOLDER);
      const parent = this.cardStore.get(current.parent);
      if (!parent) {
        throw new Error(
          `Card '${card.key}' has parent '${current.parent}' which is not in tree '${this.treeName}'`,
        );
      }
      current = parent;
    }
    segments.push(current.key);
    return join(this.treeRoot, ...segments.reverse());
  }

  // The folder a new child of the given parent would be created in.
  private childFolderOf(parentKey: string = ROOT): string {
    return parentKey === ROOT
      ? this.treeRoot
      : join(this.pathOf(parentKey), CHILDREN_FOLDER);
  }

  /**
   * The folder a card with the given position would live in.
   * @param parentKey Parent card key, or 'root'.
   * @param cardKey Key of the card to be created.
   */
  public pathFor(parentKey: string, cardKey: string): string {
    return join(this.childFolderOf(parentKey), cardKey);
  }

  /**
   * Every card in the tree, fully hydrated.
   * @returns hydrated cards.
   */
  public cards(): Card[] {
    return Array.from(this.cardStore.values()).map((card) =>
      this.cardView(card),
    );
  }

  /**
   * Metadata-level view of every card in the tree: no content, no attachment
   * listing.
   */
  public nodes(): CardNode[] {
    return Array.from(this.cardStore.values()).map((card) =>
      this.nodeView(card),
    );
  }

  /**
   * The card keys in the tree.
   */
  public keys(): string[] {
    return Array.from(this.cardStore.keys());
  }

  /**
   * How many cards the tree holds.
   */
  public get count(): number {
    return this.cardStore.size;
  }

  /**
   * Every attachment of every card in the tree.
   */
  public attachments(): CardAttachment[] {
    const attachments: CardAttachment[] = [];
    for (const card of this.cardStore.values()) {
      if (card.attachments.length === 0) {
        continue;
      }
      const path = this.pathOfStored(card);
      attachments.push(
        ...card.attachments.map((attachment) =>
          CardTree.attachmentView(card.key, path, attachment),
        ),
      );
    }
    return attachments;
  }

  /**
   * The tree's root cards, each with its children populated.
   */
  public rootCards(): Card[] {
    const rootCards: Card[] = [];
    for (const card of this.cardStore.values()) {
      if (card.parent === ROOT || !card.parent) {
        rootCards.push(this.cardView(card));
      }
    }
    return rootCards;
  }

  /**
   * One card, fully hydrated.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public card(cardKey: string): Card {
    return this.cardView(this.stored(cardKey));
  }

  /**
   * Metadata-level view of one card: no content, no attachment listing.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public node(cardKey: string): CardNode {
    return this.nodeView(this.stored(cardKey));
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
    const card = this.stored(cardKey);
    const path = this.pathOfStored(card);
    return card.attachments.map((attachment) =>
      CardTree.attachmentView(cardKey, path, attachment),
    );
  }

  /**
   * The cards for the given keys, fully hydrated. Keys the tree does not hold
   * are skipped.
   * @param cardKeys Card keys to read.
   */
  public cardsFor(cardKeys: string[]): Card[] {
    const cards: Card[] = [];
    for (const cardKey of cardKeys) {
      const card = this.cardStore.get(cardKey);
      if (card) {
        cards.push(this.cardView(card));
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
    return join(this.pathOf(cardKey), ATTACHMENT_FOLDER);
  }

  /**
   * Puts a card the caller has created into the tree.
   * @param card Card to insert.
   * @throws DuplicateCardKeyError if any tree already holds the card's key
   */
  public insert(card: Card) {
    this.assertWritable();
    this.options.keys.claim([card.key], this);
    this.store(card.key, {
      key: card.key,
      parent: card.parent || ROOT,
      children: [],
      metadata: CardTree.normalizedMetadata(card.metadata),
      content: card.content,
      attachments: CardTree.storedAttachments(card),
    });
  }

  // The attachments of a card being inserted, as folder-relative names.
  private static storedAttachments(card: Card): StoredAttachment[] {
    const attachmentFolder = join(card.path, ATTACHMENT_FOLDER);
    return card.attachments.map((attachment) => {
      const dir = attachment.path
        ? relative(attachmentFolder, attachment.path)
        : '';
      if (dir.startsWith('..')) {
        CardTree.logger.warn(
          `Attachment '${attachment.fileName}' of card '${card.key}' is outside the card's attachment folder`,
        );
        return { fileName: attachment.fileName, dir: '' };
      }
      return { fileName: attachment.fileName, dir };
    });
  }

  /**
   * Moves a card to a new position in the tree.
   * @param cardKey Card to move.
   * @param parent New parent card key, or 'root'.
   */
  public relocate(cardKey: string, parent: string) {
    this.assertWritable();
    const card = this.stored(cardKey);
    this.store(cardKey, { ...card, parent });
  }

  /**
   * Takes a card and its descendants out of the tree, without touching the
   * filesystem. The caller hands the result to the destination tree's graft().
   * @returns the subtree's cards, parents before children.
   */
  public uproot(cardKey: string): StoredCard[] {
    this.assertWritable();
    const uprooted: StoredCard[] = [];
    const collect = (key: string) => {
      const card = this.cardStore.get(key);
      if (!card) {
        return;
      }
      uprooted.push(card);
      for (const childKey of this.childrenOf(key)) {
        collect(childKey);
      }
    };
    collect(cardKey);
    // Children first, so a parent's child list is empty by the time it goes.
    for (const card of [...uprooted].reverse()) {
      this.unstore(card.key);
    }
    this.options.keys.release(uprooted.map((card) => card.key));
    return uprooted;
  }

  /**
   * Puts a subtree taken out of another tree into this one.
   * @param cards The subtree's cards, parents before children.
   * @param parent New parent for the subtree's root card, or 'root'.
   * @throws DuplicateCardKeyError if any of the keys is already held
   */
  public graft(cards: StoredCard[], parent: string) {
    this.assertWritable();
    if (cards.length === 0) {
      return;
    }
    this.options.keys.claim(
      cards.map((card) => card.key),
      this,
    );
    for (const [index, card] of cards.entries()) {
      this.store(card.key, {
        ...card,
        parent: index === 0 ? parent : card.parent,
        children: [],
        attachments: card.attachments.map((attachment) => ({ ...attachment })),
      });
    }
  }

  /**
   * Persists a card's content, and keeps the store in step with it.
   * @param card Card to persist.
   * @returns true if the store was updated; false if the card has no content,
   *   or the tree does not hold it.
   */
  public async writeContent(card: Card): Promise<boolean> {
    this.assertWritable();
    if (card.content == null) {
      return false;
    }
    const stored = this.cardStore.get(card.key);
    if (!stored) {
      CardTree.logger.warn(`Card '${card.key}' not found`);
      return false;
    }
    await writeFile(
      join(this.pathOfStored(stored), CARD_CONTENT_FILE),
      card.content,
    );
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
    this.assertWritable();
    const stored = this.cardStore.get(card.key);
    if (!stored) {
      CardTree.logger.warn(`Card '${card.key}' not found`);
      return false;
    }
    const sanitizedMetadata = await this.persistMetadata(
      card,
      this.pathOfStored(stored),
    );
    if (!sanitizedMetadata) {
      return false;
    }
    stored.metadata = CardTree.normalizedMetadata(sanitizedMetadata);
    return true;
  }

  // Writes the card's metadata file and stamps 'lastUpdated'. The store is
  // left alone; the sanitized object is returned so the caller can store
  // exactly what was written.
  private async persistMetadata(
    card: Card,
    cardPath: string,
  ): Promise<CardMetadata | undefined> {
    if (card.metadata == null) {
      return undefined;
    }
    card.metadata.lastUpdated = new Date().toISOString();

    const sanitizedMetadata = CardTree.sanitizeMetadata(card);
    await writeJsonFile(join(cardPath, CARD_METADATA_FILE), sanitizedMetadata);
    return sanitizedMetadata;
  }

  /**
   * Creates a card's folder on disk and writes its content and metadata.
   *
   * Does not put the card into the store: a node being created is not in it
   * yet, so its folder comes from the card and not from the edges. Adding a
   * created card is the caller's notification step.
   * @param card Card to create. Its 'path' is where the folder goes.
   */
  public async createNode(card: Card): Promise<void> {
    this.assertWritable();
    await mkdir(card.path, { recursive: true });
    // A card folder without a content file cannot be loaded back, so the file
    // is always written, empty when the card has no content.
    await writeFile(join(card.path, CARD_CONTENT_FILE), card.content ?? '');
    await this.persistMetadata(card, card.path);
  }

  /**
   * Deletes a card's folder and its descendants', and drops them from the
   * store. Children go first, so a failure part-way leaves no card whose
   * folder is gone but whose parent's is not.
   * @param cardKey Root of the subtree to delete.
   * @returns true if the card was in the tree; false otherwise.
   */
  public async deleteSubtree(cardKey: string): Promise<boolean> {
    const card = this.cardStore.get(cardKey);
    if (!card) {
      return false;
    }
    this.assertWritable();
    const path = this.pathOfStored(card);
    for (const child of this.childrenOf(cardKey)) {
      await this.deleteSubtree(child);
    }
    await deleteDir(path);
    this.options.keys.release([cardKey]);
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
    this.assertWritable();
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

    this.recordAttachment(cardKey, fileName);
  }

  // Records an attachment file in the store.
  private recordAttachment(cardKey: string, fileName: string) {
    const card = this.stored(cardKey);
    const isDuplicate = card.attachments.some(
      (existing) => existing.dir === '' && existing.fileName === fileName,
    );
    if (isDuplicate) {
      CardTree.logger.warn(
        `Duplicate attachment prevented: ${fileName} for card ${cardKey}`,
      );
      return;
    }
    card.attachments.push({ fileName, dir: '' });
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
    this.assertWritable();
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
   * Renames a card's attachment file, and keeps the store in step with it.
   * @param cardKey Card whose attachment is renamed.
   * @param fileName Current attachment file name.
   * @param newFileName New attachment file name. A file name, not a path, and
   *   not one the card already has a file under.
   * @throws CardNotFoundError if the tree does not hold the card; if it holds
   *   no such attachment, the new name is not a plain file name inside the
   *   card's attachment folder, or a file of that name is already there.
   */
  public async renameAttachment(
    cardKey: string,
    fileName: string,
    newFileName: string,
  ): Promise<void> {
    this.assertWritable();
    const card = this.stored(cardKey);
    const attachment = card.attachments.find(
      (item) => item.fileName === fileName,
    );
    if (!attachment) {
      throw new Error(`Attachment not found: ${fileName}`);
    }
    if (fileName === newFileName) {
      return;
    }

    const folder = join(
      this.pathOfStored(card),
      ATTACHMENT_FOLDER,
      attachment.dir,
    );
    const target = resolve(folder, newFileName);
    // A name that is not a plain file name renames the file out of the folder
    // the card owns, while the store keeps reporting it as an attachment here.
    if (
      basename(newFileName) !== newFileName ||
      !target.startsWith(resolve(folder) + sep)
    ) {
      throw new Error(`Invalid attachment filename: ${newFileName}`);
    }
    // rename() replaces its destination silently; a plain check is enough
    // because attachment writes hold the project's write lock.
    if (pathExists(target)) {
      throw new Error(`Attachment already exists: ${newFileName}`);
    }
    await rename(join(folder, fileName), target);

    attachment.fileName = newFileName;
  }

  /**
   * Loads the tree's cards from its root folder.
   * @throws DuplicateCardKeyError if a loaded card key is already held by any
   *   tree
   */
  public async load(): Promise<void> {
    const cards = await this.loadEntries();
    this.options.keys.claim(
      cards.map((card) => card.key),
      this,
    );
    for (const card of cards) {
      this.store(card.key, card);
    }
    this.populated = true;
  }

  /**
   * Empties the tree.
   */
  public clear() {
    this.options.keys.releaseOwner(this);
    this.populated = false;
    this.cardStore.clear();
    this.childrenIndex.clear();
  }

  /**
   * Reloads the tree's cards from disk.
   *
   * Evict before loading: reloaded cards keep their keys and the store rejects
   * a key it already holds.
   */
  public async reload(): Promise<void> {
    this.clear();
    await this.load();
  }
}
