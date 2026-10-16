// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { SWRConfiguration } from 'swr';
import { projectApiPaths } from '../swr';
import { useSWRHook } from './common';

export const useValidateResource = (
  resourceName: string,
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook<'validateResource'>(
    projectApiPaths(projectPrefix).validateResource(resourceName),
    'validateResource',
    null,
    options,
  );
