/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { useSWRHook } from './common';
import { apiPaths, callApi } from '../swr';
import { mutate } from 'swr';
import type { CreateTemplateData } from '@/lib/definitions';

import type { SWRConfiguration } from 'swr';

export const useTemplates = (options?: SWRConfiguration) =>
  useSWRHook<'templates'>(apiPaths.templates(), 'templates', null, options);

export const createTemplate = async (data: CreateTemplateData) => {
  await callApi(apiPaths.templates(), 'POST', data);
  mutate(apiPaths.templates());
  mutate(apiPaths.resourceTree());
};

export const createTemplateCard = async (
  template: string,
  cardType: string,
  parentKey?: string,
  count?: number,
) => {
  const result = await callApi<{ cards: string[] }>(
    apiPaths.templateCard(),
    'POST',
    { template, cardType, parentKey, count },
  );
  mutate(apiPaths.resourceTree());
  return result.cards;
};
