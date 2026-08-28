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
import { basename, join, relative, resolve, sep } from 'node:path';
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
import type { StoredAttachment, StoredCard } from './card-cache.js';
import { CardNotFoundError } from '../../exceptions/index.js';
import { deleteDir } from '../../utils/file-utils.js';
import { getChildLogger } from '../../utils/log-utils.js';
import { writeJsonFile } from '../../utils/json.js';
import {
  EMPTY_RANK,
  FIRST_RANK,
  getRankAfter,
  getRankBetween,
  rebalanceRanks,
  sortItems,
} from '../../utils/lexorank.js';

import type { CardFactContext } from '../../utils/clingo-facts.js';
import type { CardKeyRegistry } from './card-keys.js';

import type {
  Card,
  CardAttachment,
  CardMetadata,
  CardNode,
} from '../../interfaces/project-interfaces.js';

import { isPredefinedField, ROOT } from '../../utils/constants.js';

// A card's own files, inside its folder.
const CARD_CONTENT_FILE = 'index.adoc';
const CARD_METADATA_FILE = 'index.json';
// A card's attachment folder, inside its folder.
const ATTACHMENT_FOLDER = 'a';
// A card's children live in this folder, inside its folder.
const CHILDREN_FOLDER = 'c';

/**
 * How one card tree differs from another. Everything else about a card is the
 * same whether it is a project card or a template card — the same schema
 * validates both.
 *
 * name - the tree's identity: 'project', or a template's full resource name.
 * rootPath - the folder the tree's cards are rooted at: 'cardRoot', or a
 *   template's 'c' folder.
 * writable - whether the tree accepts writes. A module's cards are read-only,
 *   and this flag is what enforces it; the command-layer checks that report a
 *   friendly error are a courtesy in front of it.
 * emitsCardFact - whether the tree's cards get the card(Key) fact. Only the
 *   project's do, which is what makes template cards invisible to every query
 *   predicated on card(K).
 * validationApplies - whether the tree's cards take part in workflow
 *   semantics: metadata validation against the card's workflow and card type,
 *   and the transition permissions built on it. Template cards are exempt -
 *   they carry an empty workflow state by construction, so there is nothing to
 *   validate and no transition to permit.
 * keys - the project-level card key registry. Card keys are unique across the
 *   project and all of its templates, so this is shared by every tree.
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
 * A rank the caller is to persist: which card, and what its rank becomes.
 *
 * The tree computes rank values; it does not write them. Persisting a rank
 * validates the card and notifies the calculation engine, neither of which is
 * the tree's business — so the rank methods hand back the changes in the order
 * they must be applied and the command applies them.
 */
export interface RankChange {
  cardKey: string;
  rank: string;
}

/**
 * Owner of one container's cards: their storage, their structure, their indexes
 * and their filesystem representation.
 *
 * The tree knows about card folders, card keys and parent-child edges. It knows
 * nothing about workflows, card types, permissions or clingo — anything that
 * needs a query answer is a command-level concern and belongs above this class.
 * The one test that keeps the boundary honest: if it needs a clingo answer, it
 * is not a tree operation.
 *
 * Card paths are derived, never stored: a root card sits directly in the tree's
 * root folder, and every other card sits in its parent's 'c' folder. That is
 * what makes a folder move a single edge update instead of a recursive string
 * rewrite over every descendant and every attachment.
 *
 * There is one tree per container: the project has one, and so does every
 * template, including the templates that come from modules. They share nothing
 * but the key registry.
 */
export class CardTree {
  private readonly cache: CardCache;
  private treeName: string;

  constructor(private readonly options: CardTreeOptions) {
    this.treeName = options.name;
    this.cache = new CardCache(options.rootPath);
  }

  /**
   * The tree's store: its card map and the adjacency index over it.
   *
   * The tree is the store's only writer; this is here so the store's own
   * invariants can be asserted directly. Production code goes through the
   * tree's surface.
   */
  public get store(): CardCache {
    return this.cache;
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
    return this.cache.root;
  }

  /**
   * Whether the tree accepts writes.
   */
  public get writable(): boolean {
    return this.options.writable;
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
   *
   * No reload: paths are derived, so the cards the tree holds are already
   * correct — they just live somewhere else now.
   * @param name The tree's new name.
   * @param rootPath The tree's new root folder.
   */
  public rebase(name: string, rootPath: string) {
    this.treeName = name;
    this.cache.rebase(rootPath);
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
   * The keys of a card's ancestors, nearest first.
   * @param cardKey Card key whose ancestors to return.
   */
  public ancestorsOf(cardKey: string): string[] {
    const ancestors: string[] = [];
    let card = this.cache.getCard(cardKey);
    while (card && card.parent !== ROOT) {
      ancestors.push(card.parent);
      card = this.cache.getCard(card.parent);
    }
    return ancestors;
  }

  /**
   * Whether the tree holds a card.
   * @param cardKey Card key to check.
   */
  public has(cardKey: string): boolean {
    return this.cache.hasCard(cardKey);
  }

  /**
   * Whether the tree has been loaded.
   */
  public get isPopulated(): boolean {
    return this.cache.isPopulated;
  }

  /**
   * The folder a card's own files live in.
   * @param cardKey Card key to locate.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public pathOf(cardKey: string): string {
    return this.pathOfStored(this.cached(cardKey));
  }

  // The folder a stored card's files live in, walked out of the edges.
  private pathOfStored(card: StoredCard): string {
    const segments: string[] = [];
    let current: StoredCard = card;
    while (current.parent !== ROOT) {
      segments.push(current.key, CHILDREN_FOLDER);
      const parent = this.cache.getCard(current.parent);
      if (!parent) {
        throw new Error(
          `Card '${card.key}' has parent '${current.parent}' which is not in tree '${this.treeName}'`,
        );
      }
      current = parent;
    }
    segments.push(current.key);
    return join(this.cache.root, ...segments.reverse());
  }

  /**
   * The folder a new child of the given parent would be created in.
   * @param parentKey Parent card key, or 'root' for the tree's own root.
   */
  public childFolderOf(parentKey: string = ROOT): string {
    return parentKey === ROOT
      ? this.cache.root
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

  // Identity and tree position.
  //
  // The metadata object is shared with the store, deliberately: this is the
  // cheap read, taken once per card on the fact-projection path, and cloning
  // there is the cost that was measured away. Sharing is safe because stored
  // metadata is frozen (see CardCache.normalizedMetadata) — a caller that
  // tries to write to it gets a TypeError instead of silently editing the
  // store. Callers that need to modify metadata use cards()/card(), which
  // hand out an unfrozen copy. 'children' is copied: it is the adjacency
  // index's own array, and it is small.
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
  // a caller might modify. Content is a string, so sharing it is sharing a
  // value.
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

  // An attachment as callers see it: its own folder and its mime type are
  // derived from the card's path and the file's name.
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

  // Modules are read-only. The tree is where that is enforced, so no write
  // path can forget it.
  private assertWritable() {
    if (!this.options.writable) {
      throw new Error(`Cannot modify imported module`);
    }
  }

  /**
   * Every card in the tree, fully hydrated.
   *
   * A tree that has not been loaded holds no cards, which is the same answer a
   * container with no cards on disk gives. Whether the project's own tree has
   * been loaded is Project.populateCaches's business, not a per-read check.
   * @returns hydrated cards, in tree insertion order.
   */
  public cards(): Card[] {
    return this.cache.cards().map((card) => this.cardView(card));
  }

  /**
   * Metadata-level view of every card in the tree: no content, no attachment
   * listing.
   */
  public nodes(): CardNode[] {
    return this.cache.cards().map((card) => this.nodeView(card));
  }

  /**
   * The card keys in the tree.
   */
  public keys(): string[] {
    return this.cache.keys();
  }

  /**
   * How many cards the tree holds.
   */
  public get count(): number {
    return this.cache.count;
  }

  /**
   * Every attachment of every card in the tree.
   */
  public attachments(): CardAttachment[] {
    const attachments: CardAttachment[] = [];
    for (const card of this.cache.cards()) {
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
    return this.cache
      .cards()
      .filter((card) => card.parent === ROOT || !card.parent)
      .map((card) => this.cardView(card));
  }

  /**
   * One card, fully hydrated.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public card(cardKey: string): Card {
    return this.cardView(this.cached(cardKey));
  }

  /**
   * Metadata-level view of one card: no content, no attachment listing.
   * @param cardKey Card key to read.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public node(cardKey: string): CardNode {
    return this.nodeView(this.cached(cardKey));
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
    const card = this.cached(cardKey);
    const path = this.pathOfStored(card);
    return card.attachments.map((attachment) =>
      CardTree.attachmentView(cardKey, path, attachment),
    );
  }

  /**
   * The cards for the given keys. Keys the tree does not hold are skipped.
   * @param cardKeys Card keys to read.
   */
  public cardsFor(cardKeys: string[]): Card[] {
    const cards: Card[] = [];
    for (const cardKey of cardKeys) {
      const card = this.cache.getCard(cardKey);
      if (card) {
        cards.push(this.cardView(card));
      }
    }
    return cards;
  }

  // The stored card, or a CardNotFoundError.
  private cached(cardKey: string): StoredCard {
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
    return join(this.pathOf(cardKey), ATTACHMENT_FOLDER);
  }

  // ---------------------------------------------------------------------
  // Ranks.
  //
  // A rank orders a card among its siblings. All of the arithmetic lives in
  // utils/lexorank; what the tree adds is the only thing lexorank cannot know
  // - which cards are siblings, and what ranks they hold. Callers decide the
  // intent ("after this card", "first", "a block of five"); the tree turns it
  // into values.
  // ---------------------------------------------------------------------

  /**
   * The keys under a parent, in rank order.
   * @param parentKey Parent card key, or 'root' for the tree's root cards.
   */
  public siblingsUnder(parentKey: string): string[] {
    const keys =
      parentKey === ROOT
        ? this.cache
            .cards()
            .filter((card) => card.parent === ROOT || !card.parent)
            .map((card) => card.key)
        : this.cache.childrenOf(parentKey);
    return sortItems(keys, (key) => this.rankOf(key) ?? EMPTY_RANK);
  }

  /**
   * The keys of a card's siblings, in rank order. The card itself is one of
   * them.
   * @param cardKey Card key whose sibling set to return.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public siblingsOf(cardKey: string): string[] {
    return this.siblingsUnder(this.cached(cardKey).parent);
  }

  // The rank a card holds, or undefined if it holds none. An empty string and
  // EMPTY_RANK both mean 'no rank': EMPTY_RANK is the placeholder a card gets
  // when there was nothing to rank it against, and it is not a position -
  // getRankAfter cannot extend it (it carries the '1|' bucket prefix, which
  // the arithmetic does not understand).
  private rankOf(cardKey: string): string | undefined {
    const rank = this.cache.getCard(cardKey)?.metadata?.rank;
    if (typeof rank !== 'string' || rank === '' || rank === EMPTY_RANK) {
      return undefined;
    }
    return rank;
  }

  /**
   * Ranks for a block of new cards placed after everything already ranked
   * under a parent.
   *
   * The one allocator for "append here": a card being moved in, a card being
   * added to a template, and a whole template instantiation all take their
   * ranks from it.
   * @param parentKey Parent the cards will sit under, or 'root'.
   * @param count How many ranks to allocate.
   * @returns the ranks, in increasing order.
   */
  public rankBlock(parentKey: string, count: number): string[] {
    // FIRST_RANK is the anchor rather than the first value handed out, so
    // '0|a' stays free for rankFirst to claim without having to demote
    // whoever holds it.
    let previous = this.lastRankUnder(parentKey) ?? FIRST_RANK;
    const ranks: string[] = [];
    for (let index = 0; index < count; index++) {
      previous = getRankAfter(previous);
      ranks.push(previous);
    }
    return ranks;
  }

  // The highest rank held under a parent, or undefined when nothing there
  // holds one.
  private lastRankUnder(parentKey: string): string | undefined {
    const ranks = this.siblingsUnder(parentKey)
      .map((key) => this.rankOf(key))
      .filter((rank): rank is string => rank !== undefined);
    return sortItems(ranks, (rank) => rank).pop();
  }

  /**
   * Places a card immediately after one of its siblings.
   * @param cardKey Card to rank.
   * @param afterKey Sibling to place it after.
   * @returns the ranks to persist, in order. Ranks that have drifted into
   *   duplicates or inversions are rebalanced first, so the result may name
   *   siblings other than the ranked card.
   * @throws CardNotFoundError if the tree does not hold either card
   */
  public rankAfter(cardKey: string, afterKey: string): RankChange[] {
    this.cached(cardKey);
    const siblings = this.siblingsOf(afterKey);
    const index = siblings.indexOf(afterKey);
    return this.withUsableRanks(siblings, (rankAt) =>
      index === siblings.length - 1
        ? [{ cardKey, rank: getRankAfter(rankAt(index)) }]
        : [{ cardKey, rank: getRankBetween(rankAt(index), rankAt(index + 1)) }],
    );
  }

  /**
   * Places a card first among its siblings.
   * @param cardKey Card to rank.
   * @returns the ranks to persist, in order; empty if the card already holds
   *   the first position. Freeing FIRST_RANK may take demoting whoever holds
   *   it, which is then the first change in the result.
   * @throws CardNotFoundError if the tree does not hold the card
   */
  public rankFirst(cardKey: string): RankChange[] {
    const siblings = this.siblingsOf(cardKey);
    const firstKey = siblings[0];
    if (firstKey === cardKey && this.rankOf(cardKey)) {
      return [];
    }
    if (this.rankOf(firstKey) !== FIRST_RANK) {
      return [{ cardKey, rank: FIRST_RANK }];
    }
    // The first card is already at FIRST_RANK; demote it to a rank between
    // itself and the second card to free FIRST_RANK for the target card.
    if (siblings.length < 2) {
      throw new Error(`Second rank not found`);
    }
    return this.withUsableRanks(siblings, (rankAt) => [
      { cardKey: firstKey, rank: getRankBetween(rankAt(0), rankAt(1)) },
      { cardKey, rank: FIRST_RANK },
    ]);
  }

  /**
   * Even ranks for the cards under a parent, spread across the whole rank
   * space.
   * @param parentKey Parent whose children to rebalance, or 'root'.
   * @returns the ranks to persist, in order.
   */
  public rebalanceUnder(parentKey: string): RankChange[] {
    const siblings = this.siblingsUnder(parentKey);
    const ranks = rebalanceRanks(siblings.length);
    return siblings.map((cardKey, index) => ({
      cardKey,
      rank: ranks[index],
    }));
  }

  /**
   * Even ranks for everything below a parent, level by level.
   * @param parentKey Parent whose subtree to rebalance, or 'root' for the
   *   whole tree.
   * @returns the ranks to persist, in order.
   */
  public rebalanceSubtree(parentKey: string): RankChange[] {
    const changes = this.rebalanceUnder(parentKey);
    for (const change of [...changes]) {
      if (this.childrenOf(change.cardKey).length > 0) {
        changes.push(...this.rebalanceSubtree(change.cardKey));
      }
    }
    return changes;
  }

  // Runs a rank computation against the sibling ranks, and keeps it honest
  // about ranks the arithmetic cannot work with.
  //
  // A sibling set drifts: a card can be left without a rank, and two can end
  // up sharing one or holding an inverted pair - all of which getRankBetween
  // refuses rather than inventing an answer for. When that happens the set is
  // rebalanced into evenly spread ranks and the computation is run again
  // against those, with the rebalance prepended to the changes so the caller
  // persists the repair along with the placement. A healthy sibling set - the
  // normal case - pays nothing for this.
  private withUsableRanks(
    siblings: string[],
    compute: (rankAt: (index: number) => string) => RankChange[],
  ): RankChange[] {
    const ranks = siblings.map((key) => this.rankOf(key));
    if (ranks.every((rank) => rank !== undefined)) {
      try {
        return compute((index) => ranks[index]!);
      } catch {
        // Drifted ranks. Fall through to the rebalance and retry.
      }
    }
    const rebalanced = rebalanceRanks(siblings.length);
    return [
      ...siblings.map((cardKey, index) => ({
        cardKey,
        rank: rebalanced[index],
      })),
      ...compute((index) => rebalanced[index]),
    ];
  }

  /**
   * Creates a card's folder on disk and writes its content and metadata.
   *
   * Does not put the card into the store: adding a created card is the
   * caller's notification step, which also runs the creation query and its
   * side effects, and neither belongs to the tree. The store is therefore not
   * consulted either — a node being created is by definition not in it yet,
   * so its folder comes from the card and not from the edges.
   * @param card Card to create. Its 'path' is where the folder goes.
   */
  public async createNode(card: Card): Promise<void> {
    this.assertWritable();
    await mkdir(card.path, { recursive: true });
    // A card folder without a content file cannot be loaded back, so the file
    // is always written, empty when the card has no content.
    await this.writeContentFile(card.path, card.content ?? '');
    await this.persistMetadata(card, card.path);
  }

  /**
   * Puts a card the caller has created into the tree.
   * @param card Card to insert.
   * @throws DuplicateCardKeyError if any tree already holds the card's key
   */
  public insert(card: Card) {
    this.assertWritable();
    this.options.keys.claim([card.key], this);
    this.cache.put({
      key: card.key,
      parent: card.parent || ROOT,
      metadata: card.metadata,
      content: card.content,
      attachments: CardTree.storedAttachments(card),
    });
  }

  // The attachments of a card being inserted, as folder-relative names. The
  // card's own path comes from the card rather than from the edges: it is not
  // in the store yet.
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
   *
   * Only the moved card's own edge changes: its descendants' paths are derived
   * from it, so nothing needs rewriting below it.
   * @param cardKey Card to move.
   * @param parent New parent card key, or 'root'.
   */
  public relocate(cardKey: string, parent: string) {
    this.assertWritable();
    this.cached(cardKey);
    this.cache.relocate(cardKey, parent);
  }

  /**
   * Takes a card and its descendants out of the tree, without touching the
   * filesystem.
   *
   * The other half of a move between two trees; the caller passes what it gets
   * back to the destination tree's graft().
   * @param cardKey Root of the subtree to take out.
   * @returns the subtree's cards, parents before children.
   */
  public uproot(cardKey: string): StoredCard[] {
    this.assertWritable();
    const uprooted: StoredCard[] = [];
    const collect = (key: string) => {
      const card = this.cache.getCard(key);
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
      this.cache.deleteCard(card.key);
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
      this.cache.put({
        ...card,
        parent: index === 0 ? parent : card.parent,
      });
    }
  }

  /**
   * Persists a card's content, and keeps the store in step with it.
   * @param card Card to persist.
   * @returns true if the store was updated; false if the card has no content.
   */
  public async writeContent(card: Card): Promise<boolean> {
    this.assertWritable();
    if (card.content == null) {
      return false;
    }
    await this.writeContentFile(this.pathOf(card.key), card.content);
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
    this.assertWritable();
    const sanitizedMetadata = await this.persistMetadata(
      card,
      this.pathOf(card.key),
    );
    if (!sanitizedMetadata) {
      return false;
    }
    return this.cache.updateCardMetadata(card.key, sanitizedMetadata);
  }

  // The single place that knows where a card's content lives.
  private async writeContentFile(cardPath: string, content: string) {
    await writeFile(join(cardPath, CARD_CONTENT_FILE), content);
  }

  // Writes the card's metadata file and stamps 'lastUpdated'. The store is
  // left alone; the sanitized object is returned so the caller can cache
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
   * @returns true if the card was in the tree; false otherwise.
   */
  public async deleteSubtree(cardKey: string): Promise<boolean> {
    const card = this.cache.getCard(cardKey);
    if (!card) {
      return false;
    }
    this.assertWritable();
    const path = this.pathOfStored(card);
    // The child list is a snapshot: removing a child replaces the parent's
    // list in the adjacency index rather than mutating the array walked here.
    for (const child of this.childrenOf(cardKey)) {
      await this.deleteSubtree(child);
    }
    await deleteDir(path);
    this.options.keys.release([cardKey]);
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
    this.assertWritable();
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

    const folder = join(
      this.pathOfStored(card),
      ATTACHMENT_FOLDER,
      attachment.dir,
    );
    await rename(join(folder, fileName), join(folder, newFileName));

    this.cache.renameAttachment(cardKey, fileName, newFileName);
  }

  /**
   * Loads the tree's cards from its root folder.
   * @throws DuplicateCardKeyError if a loaded card key is already held by any
   *   tree
   */
  public async load(): Promise<void> {
    const loaded = await this.cache.populate();
    this.options.keys.claim(
      loaded.map((card) => card.key),
      this,
    );
  }

  /**
   * Empties the tree.
   */
  public clear() {
    this.options.keys.releaseOwner(this);
    this.cache.clear();
  }

  /**
   * Reloads the tree's cards from disk.
   *
   * The eviction comes first because the reloaded cards keep their keys, and a
   * stale entry would make the reload look like a duplicate.
   */
  public async reload(): Promise<void> {
    this.clear();
    await this.load();
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
