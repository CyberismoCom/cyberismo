// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths } from '../swr';

import type { SWRConfiguration } from 'swr';

export const useTree = (options?: SWRConfiguration, projectPrefix?: string) =>
  useSWRHook<'tree'>(
    projectApiPaths(projectPrefix).tree(),
    'tree',
    null,
    options,
  );
