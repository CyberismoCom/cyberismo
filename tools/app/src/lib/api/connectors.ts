// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths } from '../swr';

import type { SWRConfiguration } from 'swr';

export const useConnectors = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook<'connectors'>(
    projectApiPaths(projectPrefix).connectors(),
    'connectors',
    null,
    options,
  );
