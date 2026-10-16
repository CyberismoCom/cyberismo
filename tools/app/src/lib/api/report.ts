// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { callApi, projectApiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateReportData } from '@/lib/definitions';

export const createReport = async (
  data: CreateReportData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.reports(), 'POST', data);
  mutate(apiPaths.reports());
  mutate(apiPaths.resourceTree());
};
