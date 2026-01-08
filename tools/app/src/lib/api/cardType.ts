/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { callApi } from '../swr';
import { apiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateCardTypeData } from '@/lib/definitions';
import { useUpdating } from '../hooks';

export type VisibilityGroup = 'always' | 'optional' | 'hidden';

export type FieldVisibilityUpdate = {
  fieldName: string;
  group: VisibilityGroup;
  index?: number;
};

export const createCardType = async (data: CreateCardTypeData) => {
  await callApi(apiPaths.cardTypes(), 'POST', data);
  mutate(apiPaths.cardTypes());
  mutate(apiPaths.resourceTree());
};

export const updateFieldVisibility = async (
  cardTypeName: string,
  body: FieldVisibilityUpdate,
) => {
  await callApi(apiPaths.cardTypeFieldVisibility(cardTypeName), 'PATCH', body);
  mutate(apiPaths.resourceTree());
};

export const useCardTypeMutations = (cardTypeName: string) => {
  const { isUpdating, call } = useUpdating(cardTypeName);

  return {
    isUpdating: (action?: string) => isUpdating(action),
    updateFieldVisibility: async (body: FieldVisibilityUpdate) => {
      await call(
        () => updateFieldVisibility(cardTypeName, body),
        'fieldVisibility',
      );
    },
  };
};
