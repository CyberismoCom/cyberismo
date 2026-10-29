// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths } from '../swr';

import type { SWRConfiguration } from 'swr';

export const useLogicPrograms = (
  resourceName: string | null,
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook<'logicPrograms'>(
    resourceName
      ? projectApiPaths(projectPrefix).logicPrograms(resourceName)
      : null,
    'logicPrograms',
    null,
    options,
  );
