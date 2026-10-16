// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { useSWRHook } from './common';
import { projectApiPaths, callApi } from '../swr';

import type { SWRConfiguration } from 'swr';
import { mutate } from 'swr';
import type { CreateFieldTypeData } from '@/lib/definitions';

export const useFieldTypes = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook<'fieldTypes'>(
    projectApiPaths(projectPrefix).fieldTypes(),
    'fieldTypes',
    null,
    options,
  );

export const createFieldType = async (
  data: CreateFieldTypeData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.fieldTypes(), 'POST', data);
  mutate(apiPaths.fieldTypes());
  mutate(apiPaths.resourceTree());
};
