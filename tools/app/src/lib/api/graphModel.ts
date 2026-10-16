// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi, projectApiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateGraphModelData } from '@/lib/definitions';

export const createGraphModel = async (
  data: CreateGraphModelData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.graphModels(), 'POST', data);
  mutate(apiPaths.graphModels());
  mutate(apiPaths.resourceTree());
};
