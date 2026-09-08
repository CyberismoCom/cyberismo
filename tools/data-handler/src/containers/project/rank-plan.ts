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

import {
  FIRST_RANK,
  getRankAfter,
  getRankBetween,
  rebalanceRanks,
} from '../../utils/lexorank.js';

// A sibling set the planners work over, in rank order. 'rank' is undefined
// for a card that has none the arithmetic can extend.
export interface RankedCard {
  key: string;
  rank?: string;
}

export interface RankChange {
  cardKey: string;
  rank: string;
}

/**
 * Ranks that place a card immediately after one of its siblings.
 * @param siblings The card's sibling set, the card itself included.
 * @param cardKey Card to rank.
 * @param afterKey Sibling to place it after.
 */
export function planAfter(
  siblings: RankedCard[],
  cardKey: string,
  afterKey: string,
): RankChange[] {
  const index = siblings.findIndex((sibling) => sibling.key === afterKey);
  return withUsableRanks(siblings, (rankAt) =>
    index === siblings.length - 1
      ? [{ cardKey, rank: getRankAfter(rankAt(index)) }]
      : [{ cardKey, rank: getRankBetween(rankAt(index), rankAt(index + 1)) }],
  );
}

/**
 * Ranks that place a card first among its siblings. Freeing the first rank
 * may take demoting whoever holds it.
 * @param siblings The card's sibling set, the card itself included.
 * @param cardKey Card to rank.
 */
export function planFirst(
  siblings: RankedCard[],
  cardKey: string,
): RankChange[] {
  const first = siblings[0];
  if (first.key === cardKey && first.rank) {
    return [];
  }
  if (first.rank !== FIRST_RANK) {
    return [{ cardKey, rank: FIRST_RANK }];
  }
  return withUsableRanks(siblings, (rankAt) => [
    { cardKey: first.key, rank: getRankBetween(rankAt(0), rankAt(1)) },
    { cardKey, rank: FIRST_RANK },
  ]);
}

/**
 * Ranks that spread a sibling set evenly across the rank space.
 */
export function planRebalance(siblings: RankedCard[]): RankChange[] {
  const ranks = rebalanceRanks(siblings.length);
  return siblings.map((sibling, index) => ({
    cardKey: sibling.key,
    rank: ranks[index],
  }));
}

/**
 * Ranks that spread a sibling set and everything below it evenly across the
 * rank space, level by level.
 * @param siblings Sibling set to start from.
 * @param childrenOf The sibling set under a card, in rank order.
 */
export function planRebalanceSubtree(
  siblings: RankedCard[],
  childrenOf: (cardKey: string) => RankedCard[],
): RankChange[] {
  const changes = planRebalance(siblings);
  for (const change of [...changes]) {
    changes.push(
      ...planRebalanceSubtree(childrenOf(change.cardKey), childrenOf),
    );
  }
  return changes;
}

// Runs a rank computation against the sibling ranks. A drifted set - a
// missing rank, a duplicate or inverted pair - is rebalanced first and the
// computation rerun against the repair, which is prepended to the changes.
function withUsableRanks(
  siblings: RankedCard[],
  compute: (rankAt: (index: number) => string) => RankChange[],
): RankChange[] {
  const ranks = siblings.map((sibling) => sibling.rank);
  if (ranks.every((rank) => rank !== undefined)) {
    try {
      return compute((index) => ranks[index]!);
    } catch (error) {
      // Drifted ranks; fall through to the rebalance and retry. A TypeError
      // is the arithmetic's own failure, not drift.
      if (error instanceof TypeError) {
        throw error;
      }
    }
  }
  const rebalanced = rebalanceRanks(siblings.length);
  return [
    ...siblings.map((sibling, index) => ({
      cardKey: sibling.key,
      rank: rebalanced[index],
    })),
    ...compute((index) => rebalanced[index]),
  ];
}
