// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { ROOT } from '../../shared/utils/constants.js';
import type { CardTree } from '../../state/cards/card-tree.js';
import type { Checkout } from '../../state/checkout/checkout.js';

// A tree's card keys, depth first, children in rank order.
function depthFirst(tree: CardTree, parent: string, keys: string[]) {
  const children = tree.childrenOf(parent);
  if (children.length === 0) return;
  for (const key of tree.siblingsOf(children[0])) {
    keys.push(key);
    depthFirst(tree, key, keys);
  }
}

/**
 * The depth-first, rank-ordered position of every card: the project's cards
 * first, then each template's, templates in name order.
 */
export function treeOrder(checkout: Checkout): Map<string, number> {
  const keys: string[] = [];
  const templates = checkout
    .templateTrees()
    .toSorted((a, b) => a.name.localeCompare(b.name));
  for (const tree of [checkout.cardTree, ...templates]) {
    depthFirst(tree, ROOT, keys);
  }
  return new Map(keys.map((key, index) => [key, index]));
}

/** Orders two texts by their code units. */
export const compareText = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;

/**
 * Orders two sort keys part by part: numbers by value, texts by code units,
 * a number before a text, a shorter key before a longer one it starts.
 */
export function compareKeys(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  for (let index = 0; index < a.length && index < b.length; index++) {
    const [x, y] = [a[index], b[index]];
    const order =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : typeof x === 'string' && typeof y === 'string'
          ? compareText(x, y)
          : typeof x === 'number'
            ? -1
            : 1;
    if (order !== 0) return order;
  }
  return a.length - b.length;
}
