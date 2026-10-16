// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths } from '../swr';

import type { SWRConfiguration } from 'swr';
import type { CardUpdate } from './types';
import { updateCard } from './card';

/**
 * @deprecated Use useProjectSettings for project configuration. Use resource hooks for resources
 */
export const useProject = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const { callUpdate, ...rest } = useSWRHook<'project'>(
    apiPaths.cards(),
    'project',
    null,
    options,
  );
  return {
    ...rest,
    updateCard: async (key: string, update: CardUpdate) =>
      await callUpdate(() => updateCard(key, update)),
  };
};
