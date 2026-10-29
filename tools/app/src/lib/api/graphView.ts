// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi, projectApiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateGraphViewData } from '@/lib/definitions';

export const createGraphView = async (
  data: CreateGraphViewData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.graphViews(), 'POST', data);
  mutate(apiPaths.graphViews());
  mutate(apiPaths.resourceTree());
};
