// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { SWRConfiguration } from 'swr';
import { mutate } from 'swr';
import { projectApiPaths, callApi } from '../swr';
import type {
  ResourceBaseMetadata,
  OperationFor,
  UpdateOperations,
} from '@cyberismo/model';
import { useSWRHook } from './common';
import type { AnyNode } from './types';
import { useUpdating } from '../hooks';

// Helper to check if a node has data (is a resource, not a group)
export const hasResourceData = (
  node: AnyNode,
): node is Extract<AnyNode, { data: ResourceBaseMetadata }> => {
  return 'data' in node;
};

export const useResourceTree = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook(
    projectApiPaths(projectPrefix).resourceTree(),
    'resourceTree',
    [],
    options,
  );

export const useResource = (resourceName: string, projectPrefix?: string) => {
  const { isUpdating, call } = useUpdating(resourceName);
  return {
    isUpdating: (action?: string) => isUpdating(action),
    deleteResource: async () => {
      await deleteResource(resourceName, projectPrefix);
    },
    update: async <Type, T extends UpdateOperations>(
      body: UpdateOperationBody<Type, T>,
    ) => {
      await call(
        () =>
          updateResourceWithOperation<Type, T>(
            resourceName,
            body,
            projectPrefix,
          ),
        'update',
      );
    },
  };
};

export const deleteResource = async (
  resourceName: string,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const swrKey = apiPaths.resource(resourceName);
  await callApi(swrKey, 'DELETE');
  mutate(swrKey);
  mutate(apiPaths.resourceTree());
};

// Operation-based update of resource value
export type UpdateOperationBody<Type, T extends UpdateOperations> = {
  updateKey: {
    key: string;
    subKey?: string;
  };
  operation: OperationFor<Type, T>;
};

export const updateResourceWithOperation = async <
  Type,
  T extends UpdateOperations,
>(
  resourceName: string,
  body: UpdateOperationBody<Type, T>,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const swrKey = apiPaths.resource(resourceName);
  await callApi(apiPaths.resourceOperation(resourceName), 'POST', body);
  mutate(swrKey);
  mutate(apiPaths.resourceTree());
  mutate((key) => typeof key === 'string' && key.startsWith(`${swrKey}/`));
};
