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

import type { CardTree } from './card-tree.js';

// Random part of a card key: 8 characters of base-36 (0-9a-z).
const KEY_BASE = 36;
const KEY_LENGTH = 8;

/**
 * The project's card keys: who owns each one, and where new ones come from.
 * Card keys are unique across the project and every one of its templates.
 */
export class CardKeyRegistry {
  private owners: Map<string, CardTree> = new Map();
  // Keys handed out but not yet claimed by a tree, so two allocations in one
  // command cannot draw the same key.
  private allocated: Set<string> = new Set();

  // A function, because a project rename changes the prefix.
  constructor(private readonly prefix: () => string) {}

  /**
   * Records a tree as the owner of the given keys.
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
   */
  public release(cardKeys: Iterable<string>) {
    for (const cardKey of cardKeys) {
      this.owners.delete(cardKey);
    }
  }

  /**
   * Drops every key a tree holds.
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
