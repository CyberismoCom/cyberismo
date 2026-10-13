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

import type { ActorRef } from '@cyberismo/model';
import type { Checkout } from '../containers/project.js';
import { write } from '../utils/rw-lock.js';
import type { CommitIdentity } from '../utils/tx-record.js';
import {
  moveCard,
  rankAfter,
  rankAt,
  rankFirst,
  rebalanceAll,
  rebalanceUnder,
} from './move.js';

/**
 * Card operations of one handle. Writes through it are the handle's actor's.
 * Holds no state of its own.
 */
export class Cards {
  constructor(
    private readonly checkout: Checkout,
    public readonly actor: ActorRef,
    public readonly identity: CommitIdentity | undefined,
  ) {}

  /**
   * Moves a card under another card, or to a root.
   * @param source Card to move.
   * @param destination New parent card; 'root' for the root of the card's
   *   own container, or 'root:project' / 'root:<template>'.
   */
  @write((source, destination) => `Move card ${source} to ${destination}`)
  public async move(source: string, destination: string): Promise<void> {
    await moveCard(this.checkout, source, destination);
  }

  /**
   * Ranks a card right after a sibling.
   * @param cardKey Card to rank.
   * @param afterCardKey Sibling the card goes after.
   */
  @write((cardKey) => `Reorder card ${cardKey}`)
  public async rank(cardKey: string, afterCardKey: string): Promise<void> {
    await rankAfter(this.checkout, cardKey, afterCardKey);
  }

  /**
   * Ranks a card first among its siblings.
   * @param cardKey Card to rank.
   */
  @write((cardKey) => `Rank card ${cardKey} first`)
  public async rankFirst(cardKey: string): Promise<void> {
    await rankFirst(this.checkout, cardKey);
  }

  /**
   * Ranks a card at a position among its siblings.
   * @param cardKey Card to rank.
   * @param index Position; 0 is first.
   */
  @write((cardKey) => `Reorder card ${cardKey}`)
  public async rankAt(cardKey: string, index: number): Promise<void> {
    await rankAt(this.checkout, cardKey, index);
  }

  /**
   * Rebalances the ranks of a card's children.
   * @param parentCardKey Parent card.
   */
  @write((parentCardKey) => `Rebalance children of ${parentCardKey}`)
  public async rebalance(parentCardKey: string): Promise<void> {
    await rebalanceUnder(this.checkout, parentCardKey);
  }

  /** Rebalances the ranks of every card in the project and its templates. */
  @write(() => 'Rebalance project')
  public async rebalanceAll(): Promise<void> {
    await rebalanceAll(this.checkout);
  }
}
