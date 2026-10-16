// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths } from '../swr';

import type { SWRConfiguration } from 'swr';

export const useLabels = (options?: SWRConfiguration, projectPrefix?: string) =>
  useSWRHook<'labels', string[]>(
    projectApiPaths(projectPrefix).labels(),
    'labels',
    [],
    options,
  );
