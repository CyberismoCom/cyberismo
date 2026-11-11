// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { QueryResult } from '@cyberismo/model';
import { omitHiddenCards, type Workspace } from '@cyberismo/data-handler';
import type { TreeOptions } from '../../types.js';

/** Routes exported per card: data, content and source. */
export const CARD_ROUTES_PER_KEY = 3;

/**
 * Returns all cards from a tree query, flattened.
 * @param ws the command manager used for the query
 * @param options optional tree query options
 * @returns a promise that resolves to an array of all cards
 */
export async function allCards(
  ws: Workspace,
  options?: TreeOptions,
): Promise<QueryResult<'tree'>[]> {
  const fetchedCards = omitHiddenCards(
    await ws.queries.runQuery('tree', 'exportedSite', options || {}),
    !!options?.cardKey,
  );

  function flattenCards(cards: QueryResult<'tree'>[]): QueryResult<'tree'>[] {
    return cards.reduce<QueryResult<'tree'>[]>((acc, curr) => {
      acc.push(curr);
      if (curr.children && curr.children.length > 0) {
        acc.push(...flattenCards(curr.children));
      }
      return acc;
    }, []);
  }
  return flattenCards(fetchedCards);
}
