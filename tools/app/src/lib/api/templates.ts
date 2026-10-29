// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths, callApi } from '../swr';
import { mutate } from 'swr';
import type { CreateTemplateData } from '@/lib/definitions';

import type { SWRConfiguration } from 'swr';

export const useTemplates = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook<'templates'>(
    projectApiPaths(projectPrefix).templates(),
    'templates',
    null,
    options,
  );

export const createTemplate = async (
  data: CreateTemplateData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.templates(), 'POST', data);
  mutate(apiPaths.templates());
  mutate(apiPaths.resourceTree());
};

export const createTemplateCard = async (
  template: string,
  cardType: string,
  parentKey?: string,
  count?: number,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const result = await callApi<{ cards: string[] }>(
    apiPaths.templateCard(),
    'POST',
    { template, cardType, parentKey, count },
  );
  mutate(apiPaths.resourceTree());
  return result.cards;
};
