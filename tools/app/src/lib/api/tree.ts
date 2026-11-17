// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo } from 'react';
import { useSWRHook } from './common';
import { projectApiPaths } from '../swr';
import { withoutHiddenCards } from '../utils';

import type { SWRConfiguration } from 'swr';

export const useTree = (options?: SWRConfiguration, projectPrefix?: string) =>
  useSWRHook<'tree'>(
    projectApiPaths(projectPrefix).tree(),
    'tree',
    null,
    options,
  );

/** The tree without hidden cards; use for navigation and card pickers. */
export const useVisibleTree = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) => {
  const { tree, ...rest } = useTree(options, projectPrefix);
  const visible = useMemo(
    () => (tree ? withoutHiddenCards(tree) : tree),
    [tree],
  );
  return { ...rest, tree: visible };
};
