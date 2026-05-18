/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

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
