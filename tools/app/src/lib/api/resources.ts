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
import { mutate } from 'swr';
import { apiPaths, callApi } from '../swr';
import type { ResourceBaseMetadata } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { useSWRHook } from './common';
import type { AnyNode } from './types';
import type { OperationFor, UpdateOperations } from '@cyberismo/data-handler';
import { useUpdating } from '../hooks';

// Helper to check if a node has data (is a resource, not a group)
export const hasResourceData = (
  node: AnyNode,
): node is Extract<AnyNode, { data: ResourceBaseMetadata }> => {
  return 'data' in node;
};

export const useResourceTree = (options?: SWRConfiguration) =>
  useSWRHook(apiPaths.resourceTree(), 'resourceTree', [], options);

export const useResource = (resourceName: string) => {
  const { isUpdating, call } = useUpdating(resourceName);
  return {
    isUpdating: (action?: string) => isUpdating(action),
    deleteResource: async () => {
      await deleteResource(resourceName);
    },
    update: async <Type, T extends UpdateOperations>(
      body: UpdateOperationBody<Type, T>,
    ) => {
      await call(
        () => updateResourceWithOperation<Type, T>(resourceName, body),
        'update',
      );
    },
  };
};

export const deleteResource = async (resourceName: string) => {
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
) => {
  const swrKey = apiPaths.resource(resourceName);
  await callApi(apiPaths.resourceOperation(resourceName), 'POST', body);
  mutate(swrKey);
  mutate(apiPaths.resourceTree());
};
