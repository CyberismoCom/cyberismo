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
import { basename, dirname, join, resolve, sep } from 'node:path';
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from 'node:fs/promises';

import mime from 'mime-types';

import type {
  Card,
  CardAttachment,
  CardMetadata,
  CardNode,
} from '../../interfaces/project-interfaces.js';
import { CardNotFoundError } from '../../exceptions/index.js';
import { copyDir, deleteDir, pathExists } from '../../utils/file-utils.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { writeJsonFile } from '../../utils/json.js';
import { isPredefinedField, ROOT } from '../../utils/constants.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  sortItems,
} from '../../utils/lexorank.js';
import {
  ATTACHMENT_FOLDER,
  CARD_CONTENT_FILE,
  CARD_METADATA_FILE,
  CHILDREN_FOLDER,
  normalizedMetadata,
  scanCardTree,
} from './card-tree-scan.js';
import {
  planAfter,
  planFirst,
  planRebalance,
  planRebalanceSubtree,
} from './rank-plan.js';

import type { StoredAttachment, StoredCard } from './card-tree-scan.js';
import type { RankChange, RankedCard } from './rank-plan.js';
import type { CardFactContext } from '../../utils/clingo-facts.js';
import type { CardKeyRegistry } from './card-keys.js';

/**
 * Which kind of cards a tree holds. Project cards take part in workflow
 * semantics and get the card(Key) fact; template cards do neither.
 */
export type CardTreeKind = 'project' | 'template';

/**
 * How one card tree differs from another. 'name' is the tree's identity:
 * 'project', or a template's full resource name. 'keys' is the project-level
 * card key registry the tree shares with its siblings.
 */
export interface CardTreeOptions {
  name: string;
  rootPath: string;
  kind: CardTreeKind;
  writable: boolean;
  keys: CardKeyRegistry;
}

/**
 * A card to be created. An attachment's 'source' is the file that is copied
 * into the card's attachment folder under 'fileName'.
 */
export interface NewCard {
  key: string;
  parent: string;
  metadata: CardMetadata;
  content: string;
  attachments: { fileName: string; source: string }[];
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

  // A card may not sit under itself or under one of its own descendants.
  // Paths are walked up the parent edges, so a cycle is not a wrong path but
  // no path: pathOf would never terminate, and nor would anything built on it.
  private assertNoCycle(cardKey: string, parent: string) {
    let ancestor: string | undefined = parent;
    while (ancestor && ancestor !== ROOT) {
      if (ancestor === cardKey) {
        throw new Error(
          `Card '${cardKey}' cannot be placed under '${parent}', which is the card itself or one of its descendants`,
        );
      }
      ancestor = this.cardStore.get(ancestor)?.parent;
    }
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
   * Whether the tree accepts writes.
   */
  public get writable(): boolean {
    return this.options.writable;
  }

  /**
   * Which kind of cards the tree holds.
   */
  public get kind(): CardTreeKind {
    return this.options.kind;
  }

  /**
   * How the tree's cards are projected into clingo facts.
   */
  public get factContext(): CardFactContext {
    return { kind: this.options.kind, name: this.treeName };
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
  private childFolderOf(parentKey: string): string {
    return parentKey === ROOT
      ? this.treeRoot
      : join(this.pathOf(parentKey), CHILDREN_FOLDER);
  }

  // The folder a card with the given position would live in.
  private pathFor(parentKey: string, cardKey: string): string {
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
      if (card.parent === ROOT) {
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
   * The folder holding a card's attachments.
   * @param cardKey Card key to locate.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public attachmentFolderOf(cardKey: string): string {
    return join(this.pathOf(cardKey), ATTACHMENT_FOLDER);
  }

  /**
   * The keys of a card's siblings, in rank order. The card itself is one of
   * them.
   * @param cardKey Card key whose sibling set to return.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public siblingsOf(cardKey: string): string[] {
    return this.rankedSiblingsOf(cardKey).map((sibling) => sibling.key);
  }

  // The card's sibling set with ranks, in rank order.
  private rankedSiblingsOf(cardKey: string): RankedCard[] {
    return this.siblingsUnder(this.stored(cardKey).parent);
  }

  // The cards under a parent with their ranks, in rank order. 'root' means
  // the tree's root cards.
  private siblingsUnder(parentKey: string): RankedCard[] {
    const siblings = this.childrenOf(parentKey)
      .map((key) => this.stored(key))
      .map((card) => ({ key: card.key, rank: this.rankOf(card.key) }));
    return sortItems(siblings, (sibling) => sibling.rank ?? EMPTY_RANK);
  }

  // The rank a card holds, or undefined for none. '' and EMPTY_RANK both mean
  // 'no rank': EMPTY_RANK's '1|' bucket prefix is not something the
  // arithmetic can extend.
  private rankOf(cardKey: string): string | undefined {
    const rank = this.cardStore.get(cardKey)?.metadata?.rank;
    if (typeof rank !== 'string' || rank === '' || rank === EMPTY_RANK) {
      return undefined;
    }
    return rank;
  }

  private lastRankUnder(parentKey: string): string | undefined {
    return this.siblingsUnder(parentKey)
      .map((sibling) => sibling.rank)
      .findLast((rank) => rank !== undefined);
  }

  /**
   * Ranks for a block of new cards placed after everything already ranked
   * under a parent.
   * @param parentKey Parent the cards will sit under, or 'root'.
   * @returns the ranks, in increasing order.
   */
  public rankBlock(parentKey: string, count: number): string[] {
    // FIRST_RANK is the anchor rather than the first value handed out, so
    // '0|a' stays free for rankFirst to claim without demoting its holder.
    let previous = this.lastRankUnder(parentKey) ?? FIRST_RANK;
    const ranks: string[] = [];
    for (let index = 0; index < count; index++) {
      previous = getRankAfter(previous);
      ranks.push(previous);
    }
    return ranks;
  }

  /**
   * Places a card immediately after one of its siblings, and persists the
   * ranks that takes. Drifted sibling ranks are repaired first, so siblings
   * other than the ranked card may be reranked too.
   * @param cardKey Card to rank.
   * @param afterKey Sibling to place it after.
   * @throws CardNotFoundError if the tree does not hold either card
   */
  public async reorderAfter(cardKey: string, afterKey: string): Promise<void> {
    // The plan is built from afterKey's siblings, which need not hold cardKey.
    this.stored(cardKey);
    await this.applyRanks(
      planAfter(this.rankedSiblingsOf(afterKey), cardKey, afterKey),
    );
  }

  /**
   * Places a card first among its siblings, and persists the ranks that takes.
   * Freeing the first rank may take demoting whoever holds it.
   * @param cardKey Card to rank.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public async reorderFirst(cardKey: string): Promise<void> {
    await this.applyRanks(planFirst(this.rankedSiblingsOf(cardKey), cardKey));
  }

  /**
   * Spreads the ranks of the cards under a parent evenly across the rank
   * space, and persists them.
   * @param parentKey Parent whose children to rebalance, or 'root'.
   */
  public async rebalanceChildren(parentKey: string): Promise<void> {
    await this.applyRanks(planRebalance(this.siblingsUnder(parentKey)));
  }

  /**
   * Spreads the ranks of every card in the tree evenly across the rank space,
   * level by level, and persists them.
   */
  public async rebalanceAll(): Promise<void> {
    await this.applyRanks(
      planRebalanceSubtree(this.siblingsUnder(ROOT), (cardKey) =>
        this.siblingsUnder(cardKey),
      ),
    );
  }

  private async applyRanks(changes: RankChange[]): Promise<void> {
    for (const { cardKey, rank } of changes) {
      await this.writeRank(cardKey, rank);
    }
  }

  // Ordering is not a card edit: no validation, and no 'lastUpdated' stamp.
  private async writeRank(cardKey: string, rank: string): Promise<void> {
    this.assertWritable();
    const stored = this.stored(cardKey);
    if (!stored.metadata || stored.metadata.rank === rank) {
      return;
    }
    const metadata = { ...stored.metadata, rank };
    await writeJsonFile(
      join(this.pathOfStored(stored), CARD_METADATA_FILE),
      metadata,
    );
    stored.metadata = normalizedMetadata(metadata);
  }

  /**
   * Creates a batch of cards: every one of them is written to disk and put
   * into the tree, or nothing is.
   * @param cards Cards to create, in any order. A card's parent is 'root', a
   *   card already in the tree, or another card of the batch.
   * @throws CardNotFoundError if a parent is neither in the batch nor in the
   *   tree; DuplicateCardKeyError if any tree already holds one of the keys
   */
  public async createCards(cards: NewCard[]): Promise<void> {
    this.assertWritable();
    const batch = new Map(cards.map((card) => [card.key, card]));
    const ordered = CardTree.parentsFirst(cards, batch);
    for (const card of ordered) {
      if (
        card.parent !== ROOT &&
        !batch.has(card.parent) &&
        !this.has(card.parent)
      ) {
        throw new CardNotFoundError(card.parent);
      }
    }
    const keys = cards.map((card) => card.key);
    this.options.keys.claim(keys, this);

    const paths = new Map<string, string>();
    const roots: string[] = [];
    try {
      for (const card of ordered) {
        const parentInBatch = batch.has(card.parent);
        const path = parentInBatch
          ? join(paths.get(card.parent)!, CHILDREN_FOLDER, card.key)
          : this.pathFor(card.parent, card.key);
        paths.set(card.key, path);
        if (!parentInBatch) {
          roots.push(path);
        }
        await mkdir(path, { recursive: true });
        await writeFile(join(path, CARD_CONTENT_FILE), card.content);
        await this.persistMetadata(CardTree.asCard(card, path), path);
        if (card.attachments.length > 0) {
          const folder = join(path, ATTACHMENT_FOLDER);
          await mkdir(folder, { recursive: true });
          await Promise.all(
            card.attachments.map((attachment) =>
              copyFile(attachment.source, join(folder, attachment.fileName)),
            ),
          );
        }
      }
    } catch (error) {
      this.options.keys.release(keys);
      await Promise.all(
        roots.map((path) => rm(path, { recursive: true, force: true })),
      );
      throw error;
    }

    for (const card of ordered) {
      this.store(card.key, {
        key: card.key,
        parent: card.parent,
        children: [],
        metadata: normalizedMetadata(card.metadata),
        content: card.content,
        attachments: card.attachments.map((attachment) => ({
          fileName: attachment.fileName,
          dir: '',
        })),
      });
    }
  }

  private static parentsFirst(
    cards: NewCard[],
    batch: Map<string, NewCard>,
  ): NewCard[] {
    const ordered: NewCard[] = [];
    const placed = new Set<string>();
    const open = new Set<string>();
    const place = (card: NewCard) => {
      if (placed.has(card.key)) {
        return;
      }
      if (open.has(card.key)) {
        throw new Error(
          `Card '${card.key}' is inside its own subtree in the batch being created`,
        );
      }
      open.add(card.key);
      const parent = batch.get(card.parent);
      if (parent) {
        place(parent);
      }
      open.delete(card.key);
      placed.add(card.key);
      ordered.push(card);
    };
    for (const card of cards) {
      place(card);
    }
    return ordered;
  }

  private static asCard(card: NewCard, path: string): Card {
    return {
      key: card.key,
      path,
      parent: card.parent,
      children: [],
      attachments: [],
      content: card.content,
      metadata: card.metadata,
    };
  }

  /**
   * Moves a card to a new position in the tree: its rank, its folder, then its
   * edge. The card lands last among its new siblings.
   * @param cardKey Card to move.
   * @param parent New parent card key, or 'root'.
   * @throws if the card would end up under itself or under one of its own
   *   descendants
   */
  public async relocate(cardKey: string, parent: string) {
    this.assertWritable();
    this.assertNoCycle(cardKey, parent);
    if (this.stored(cardKey).parent === parent) {
      return;
    }
    // The rank is persisted before the rename: a card at its destination has
    // its destination rank, so a retry completes the move.
    const [rank] = this.rankBlock(parent, 1);
    await this.writeRank(cardKey, rank);
    const card = this.stored(cardKey);
    const from = this.pathOfStored(card);
    await CardTree.moveFolder(from, this.pathFor(parent, cardKey));
    this.store(cardKey, { ...card, parent });
    if (card.parent !== ROOT) {
      await CardTree.pruneEmptyFolder(dirname(from));
    }
  }

  /**
   * Takes a card and its descendants over from another tree, and ranks the
   * card last among its new siblings. Both trees are checked before the
   * rename; nothing is mutated if either refuses.
   * @param parent New parent card key in this tree, or 'root'.
   */
  public async adopt(source: CardTree, cardKey: string, parent: string) {
    source.assertWritable();
    this.assertWritable();
    // The rank is persisted before the rename: a card at its destination has
    // its destination rank, so a retry completes the move.
    const [rank] = this.rankBlock(parent, 1);
    await source.writeRank(cardKey, rank);
    const card = source.stored(cardKey);
    const from = source.pathOfStored(card);
    await CardTree.moveFolder(from, this.pathFor(parent, cardKey));
    // The registry refuses a claim on a key the source still owns: uproot
    // releases them, and graft claims them.
    this.graft(source.uproot(cardKey), parent);
    if (card.parent !== ROOT) {
      await CardTree.pruneEmptyFolder(dirname(from));
    }
  }

  // Moves a card's folder, and everything under it, by renaming it.
  private static async moveFolder(from: string, to: string) {
    // Moving a card into another card creates that card's 'c' folder.
    await mkdir(dirname(to), { recursive: true });
    try {
      await rename(from, to);
    } catch (error) {
      // rename cannot cross filesystems (a card root spanning a mount point).
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') {
        throw error;
      }
      await copyDir(from, to);
      await deleteDir(from);
    }
  }

  // Callers prune after their store update, so a failed prune leaves disk and
  // store agreeing. The card's former siblings are the expected ENOTEMPTY.
  private static async pruneEmptyFolder(path: string) {
    try {
      await rmdir(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'ENOENT') {
        throw error;
      }
    }
  }

  // Takes a card and its descendants out of the tree, without touching the
  // filesystem, and returns them parents before children.
  private uproot(cardKey: string): StoredCard[] {
    this.assertWritable();
    const uprooted = this.subtreeOf(cardKey);
    // Children first, so a parent's child list is empty by the time it goes.
    for (const card of [...uprooted].reverse()) {
      this.unstore(card.key);
    }
    this.options.keys.release(uprooted.map((card) => card.key));
    return uprooted;
  }

  // The stored cards of a card and its descendants, parents before children.
  private subtreeOf(cardKey: string): StoredCard[] {
    const subtree: StoredCard[] = [];
    const collect = (key: string) => {
      const card = this.cardStore.get(key);
      if (!card) {
        return;
      }
      subtree.push(card);
      for (const childKey of this.childrenOf(key)) {
        collect(childKey);
      }
    };
    collect(cardKey);
    return subtree;
  }

  // Puts a subtree taken out of another tree into this one, under 'parent'.
  private graft(cards: StoredCard[], parent: string) {
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
   * Persists a card's content, and keeps the store in step with it. A card
   * carrying no content is left alone.
   * @param card Card to persist.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public async writeContent(card: Card): Promise<void> {
    this.assertWritable();
    if (card.content == null) {
      return;
    }
    const stored = this.stored(card.key);
    await writeFile(
      join(this.pathOfStored(stored), CARD_CONTENT_FILE),
      card.content,
    );
    stored.content = card.content;
  }

  /**
   * Persists a card's metadata, and keeps the store in step with it. Stamps
   * 'lastUpdated'. A card carrying no metadata is left alone.
   * @param card Card to persist.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public async writeMetadata(card: Card): Promise<void> {
    this.assertWritable();
    const stored = this.stored(card.key);
    const sanitizedMetadata = await this.persistMetadata(
      card,
      this.pathOfStored(stored),
    );
    if (!sanitizedMetadata) {
      return;
    }
    stored.metadata = normalizedMetadata(sanitizedMetadata);
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
   * Deletes a card's folder and its descendants', and drops them from the
   * store. Children go first, so a failure part-way leaves no card whose
   * folder is gone but whose parent's is not.
   * @param cardKey Root of the subtree to delete.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public async deleteSubtree(cardKey: string): Promise<void> {
    const card = this.stored(cardKey);
    this.assertWritable();
    const path = this.pathOfStored(card);
    for (const child of this.childrenOf(cardKey)) {
      await this.deleteSubtree(child);
    }
    await deleteDir(path);
    this.options.keys.release([cardKey]);
    this.unstore(cardKey);
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
   * Loads the tree's cards from its root folder, replacing whatever it holds.
   * @throws DuplicateCardKeyError if a loaded card key is already held by
   *   another tree
   */
  public async load(): Promise<void> {
    // Evict before loading: reloaded cards keep their keys, and the store
    // rejects a key it already holds.
    this.clear();
    const cards = await scanCardTree(this.treeRoot, this.treeName);
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
}
