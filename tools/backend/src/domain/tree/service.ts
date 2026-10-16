// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Workspace } from '@cyberismo/data-handler';

/**
 * Returns the card tree of the project
 * @param ws command manager used for the query
 * @param isSsg whether the context is static site generation
 * @param cardKey optional card key to start the tree from
 * @param recursive if false, includes only the given card. Otherwise, includes all child cards recursively.
 * @returns
 */
export async function getCardTree(
  ws: Workspace,
  isSsg: boolean,
  cardKey?: string,
  recursive?: boolean,
): ReturnType<typeof ws.queries.runQuery> {
  return ws.queries.runQuery('tree', isSsg ? 'exportedSite' : 'localApp', {
    cardKey,
    recursive,
  });
}
