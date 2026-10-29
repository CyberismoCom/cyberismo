// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths, callApi } from '../swr';
import { mutate } from 'swr';
import type { CreateLinkTypeData } from '@/lib/definitions';

import type { SWRConfiguration } from 'swr';

export const useLinkTypes = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook<'linkTypes'>(
    projectApiPaths(projectPrefix).linkTypes(),
    'linkTypes',
    null,
    options,
  );

export const createLinkType = async (
  data: CreateLinkTypeData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.linkTypes(), 'POST', data);
  mutate(apiPaths.linkTypes());
  mutate(apiPaths.resourceTree());
};
