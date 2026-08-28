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

import { DuplicateCardKeyError } from '../../exceptions/index.js';
import { generateRandomString } from '../../utils/random.js';

// Type-only, so the tree can hold a registry and the registry can hand a tree
// back without the two forming a runtime import cycle.
import type { CardTree } from './card-tree.js';

// Random part of a card key: 8 characters of base-36 (0-9a-z).
const KEY_BASE = 36;
const KEY_LENGTH = 8;

/**
 * The project's card keys: who owns each one, and where new ones come from.
 *
 * Card keys are unique across the project and every one of its templates, so
 * the trees are not independent — this is the one thing they share. It lives at
 * the project level and is injected into each tree; a tree never reaches for
 * the project.
 *
 * It is also the cross-tree lookup: given a key, it names the tree that holds
 * it, which is what lets the project answer a question about "a card" without
 * knowing which of its trees the card is in.
 */
export class CardKeyRegistry {
  private owners: Map<string, CardTree> = new Map();
  // Keys handed out but not yet claimed by a tree. Kept so two allocations in
  // one command cannot draw the same key: the cards they belong to have not
  // been created yet, so nothing else knows about them.
  private allocated: Set<string> = new Set();

  /**
   * @param prefix Reads the project's card key prefix. A function, because the
   *   prefix changes when the project is renamed.
   */
  constructor(private readonly prefix: () => string) {}

  /**
   * Records a tree as the owner of the given keys.
   * @param cardKeys Keys the tree now holds.
   * @param owner Tree that holds them.
   * @throws DuplicateCardKeyError if any key is already held, by this tree or
   *   another one.
   */
  public claim(cardKeys: string[], owner: CardTree) {
    const duplicates: string[] = [];
    const seen = new Set<string>();
    for (const cardKey of cardKeys) {
      if (
        (seen.has(cardKey) || this.owners.has(cardKey)) &&
        !duplicates.includes(cardKey)
      ) {
        duplicates.push(cardKey);
      }
      seen.add(cardKey);
    }
    if (duplicates.length > 0) {
      throw new DuplicateCardKeyError(duplicates);
    }
    for (const cardKey of cardKeys) {
      this.owners.set(cardKey, owner);
      this.allocated.delete(cardKey);
    }
  }

  /**
   * Drops the given keys.
   * @param cardKeys Keys that are no longer held.
   */
  public release(cardKeys: Iterable<string>) {
    for (const cardKey of cardKeys) {
      this.owners.delete(cardKey);
    }
  }

  /**
   * Drops every key a tree holds.
   * @param owner Tree whose keys are no longer held.
   */
  public releaseOwner(owner: CardTree) {
    for (const [cardKey, tree] of this.owners) {
      if (tree === owner) {
        this.owners.delete(cardKey);
      }
    }
  }

  /**
   * Whether a card key is held by any tree.
   * @param cardKey Card key to check.
   */
  public has(cardKey: string): boolean {
    return this.owners.has(cardKey);
  }

  /**
   * The tree that holds a card key.
   * @param cardKey Card key to look up.
   * @returns the owning tree, or undefined if no tree holds the key.
   */
  public ownerOf(cardKey: string): CardTree | undefined {
    return this.owners.get(cardKey);
  }

  /**
   * Every card key in use.
   */
  public inUse(): Set<string> {
    return new Set(this.owners.keys());
  }

  /**
   * Allocates new unique card keys with the project's prefix
   * (e.g. test_x649it4x).
   * @param count How many keys to allocate.
   * @returns the allocated keys.
   * @throws if a unique key could not be created within the attempt budget
   */
  public allocate(count: number): string[] {
    if (count < 1) {
      return [];
    }
    const keys: string[] = [];
    let attempts = 10 * count;
    while (keys.length < count) {
      if (attempts-- <= 0) {
        throw new Error('Could not generate unique card key');
      }
      const cardKey = `${this.prefix()}_${generateRandomString(KEY_BASE, KEY_LENGTH)}`;
      if (this.owners.has(cardKey) || this.allocated.has(cardKey)) {
        continue;
      }
      this.allocated.add(cardKey);
      keys.push(cardKey);
    }
    return keys;
  }
}
