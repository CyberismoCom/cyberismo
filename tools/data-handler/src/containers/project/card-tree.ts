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

import { CardCache } from './card-cache.js';
import { CardNotFoundError } from '../../exceptions/index.js';
import { cardPathParts } from '../../utils/card-utils.js';
import { ROOT } from '../../utils/constants.js';

import type {
  Card,
  CardAttachment,
  CardNode,
} from '../../interfaces/project-interfaces.js';

// The location of cards that are not in a template.
const PROJECT_LOCATION = 'project';

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
}
