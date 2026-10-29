// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi, projectApiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateCalculationData } from '@/lib/definitions';
import { useUpdating } from '../hooks';

export const createCalculation = async (
  data: CreateCalculationData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.calculations(), 'POST', data);
  mutate(apiPaths.calculations());
  mutate(apiPaths.resourceTree());
};

export const useCalculations = (projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const { call, isUpdating } = useUpdating(apiPaths.calculations());

  return {
    isUpdating: (action?: string) => isUpdating(action),
    createCalculation: async (data: CreateCalculationData) =>
      await call(() => createCalculation(data, projectPrefix), 'create'),
  };
};
