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
import { cardPathParts } from '../../utils/card-utils.js';

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
}
