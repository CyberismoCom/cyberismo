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

import type { SWRConfiguration } from 'swr';
import { callApi } from '../swr';
import { apiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateWorkflowData } from '@/lib/definitions';
import { useSWRHook } from './common';

export const createWorkflow = async (data: CreateWorkflowData) => {
  await callApi(apiPaths.workflows(), 'POST', data);
  mutate(apiPaths.workflows());
  mutate(apiPaths.resourceTree());
};

/**
 * Fetches the rendered state-machine graph for a workflow.
 * When `cardKey` is provided, the diagram highlights that card's
 * current workflowState.
 * @param resourceName Full workflow resource name (prefix/workflows/identifier).
 * @param cardKey Optional card key to highlight the card's current state.
 */
export const useWorkflowGraph = (
  resourceName: string | null | undefined,
  cardKey?: string | null,
  options?: SWRConfiguration,
) => {
  const swrKey = resourceName
    ? apiPaths.workflowGraph(resourceName, cardKey ?? undefined)
    : null;
  return useSWRHook(swrKey, 'workflowGraph', null, options);
};
