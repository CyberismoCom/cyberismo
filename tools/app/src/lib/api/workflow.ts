// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { SWRConfiguration } from 'swr';
import { callApi, projectApiPaths } from '../swr';
import { mutate } from 'swr';
import type { CreateWorkflowData } from '@/lib/definitions';
import { useSWRHook } from './common';

export const createWorkflow = async (
  data: CreateWorkflowData,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
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
  const apiPaths = projectApiPaths();
  const swrKey = resourceName
    ? apiPaths.workflowGraph(resourceName, cardKey ?? undefined)
    : null;
  return useSWRHook(swrKey, 'workflowGraph', null, options);
};
