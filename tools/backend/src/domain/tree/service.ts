// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { exportedTree, type Workspace } from '@cyberismo/data-handler';

/**
 * Returns the card tree of the project
 * @param ws command manager used for the query
 * @param isSsg whether the context is static site generation
 * @param cardKey optional card key to start the tree from
 * @param recursive if false, includes only the given card. Otherwise, includes all child cards recursively.
 * @param includeHidden in a static site, keep the hidden cards, marked as hidden
 * @returns
 */
export async function getCardTree(
  ws: Workspace,
  isSsg: boolean,
  cardKey?: string,
  recursive?: boolean,
  includeHidden?: boolean,
): ReturnType<typeof ws.queries.runQuery> {
  const tree = await ws.queries.runQuery(
    'tree',
    isSsg ? 'exportedSite' : 'localApp',
    { cardKey, recursive },
  );
  // The app filters hidden cards from its navigation tree; a static site holds
  // only the exported cards, so the hidden ones only when they are included.
  return isSsg ? exportedTree(tree, { cardKey, includeHidden }) : tree;
}
