// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi } from '../swr';
import { projectApiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateCardTypeData } from '@/lib/definitions';
import { useUpdating } from '../hooks';

export type VisibilityGroup = 'always' | 'optional' | 'hidden';

export type FieldVisibilityUpdate = {
  fieldName: string;
  group: VisibilityGroup;
  index?: number;
};

export const createCardType = async (
  data: CreateCardTypeData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.cardTypes(), 'POST', data);
  mutate(apiPaths.cardTypes());
  mutate(apiPaths.resourceTree());
};

export const updateFieldVisibility = async (
  cardTypeName: string,
  body: FieldVisibilityUpdate,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.cardTypeFieldVisibility(cardTypeName), 'PATCH', body);
  mutate(apiPaths.resourceTree());
};

export const useCardTypeMutations = (
  cardTypeName: string,
  projectPrefix?: string,
) => {
  const { isUpdating, call } = useUpdating(cardTypeName);

  return {
    isUpdating: (action?: string) => isUpdating(action),
    updateFieldVisibility: async (body: FieldVisibilityUpdate) => {
      await call(
        () => updateFieldVisibility(cardTypeName, body, projectPrefix),
        'fieldVisibility',
      );
    },
  };
};
