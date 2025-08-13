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

import { SWRConfiguration, mutate } from 'swr';
import { apiPaths, callApi } from '../swr';
import type { ResourceBaseMetadata } from '@cyberismo/data-handler/interfaces/resource-interfaces';
import { useSWRHook } from './common';
import { ResourceFileContentResponse, ResourceNode } from './types';

// Helper to check if a node has data (is a resource, not a group)
export const hasResourceData = (
  node: ResourceNode,
): node is Extract<ResourceNode, { data: ResourceBaseMetadata }> => {
  return 'data' in node;
};

export const useResourceTree = (options?: SWRConfiguration) =>
  useSWRHook(apiPaths.resourceTree(), 'resourceTree', [], options);

export const useResource = (resourceName: string) => {
  return {
    deleteResource: async () => {
      await deleteResource(resourceName);
    },
  };
};

export const deleteResource = async (resourceName: string) => {
  const swrKey = apiPaths.resource(resourceName);
  await callApi(swrKey, 'DELETE');
  mutate(swrKey);
  mutate(apiPaths.resourceTree());
};

export const useResourceFileContent = (
  resourceName: string,
  options?: SWRConfiguration,
) => {
  const swrKey = apiPaths.resourceFileContent(resourceName);
  const { callUpdate, ...rest } = useSWRHook(
    swrKey,
    'resourceFileContent',
    { content: '' },
    options,
  );
  return {
    ...rest,
    updateFileContent: async (content: string) => {
      await callUpdate(() => updateResourceFileContent(resourceName, content));
    },
  };
};

export const updateResourceFileContent = async (
  resourceName: string,
  content: string,
) => {
  const swrKey = apiPaths.resourceFileContent(resourceName);
  const result = await callApi<ResourceFileContentResponse>(swrKey, 'PUT', {
    content,
  });

  mutate(swrKey, result, false);

  return result;
};
