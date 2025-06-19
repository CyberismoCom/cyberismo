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

import useSWR, { SWRConfiguration } from 'swr';
import { useUpdating } from '../hooks';
import { useProject } from './project';
import { useTranslation } from 'react-i18next';

/**
 * Generic hook for fetching any resource type from the /api/resources/{resourceType} endpoint
 * This is useful for resource types that don't have specific hooks defined
 */
export const useResources = (
  resourceType: string,
  options?: SWRConfiguration,
) => {
  const swrKey = resourceType ? `/api/resources/${resourceType}` : null;
  const { data, ...rest } = useSWR<string[]>(swrKey, options);
  const { isUpdating, call } = useUpdating(swrKey);

  return {
    ...rest,
    data: data || null,
    isUpdating,
    callUpdate: <T>(fn: () => Promise<T>, key2?: string): Promise<T> =>
      call(fn, key2),
  };
};

const resourcesToFetch = [
  'calculations',
  'cardTypes',
  'fieldTypes',
  'graphModels',
  'graphViews',
  'linkTypes',
  'reports',
  'templates',
  'workflows',
];

type ResourceTree = {
  id: string;
  label: string;
  children?: ResourceTree[];
};

/**
 * Hook for fetching all resources and building a tree of them
 */
export const useResourceTree = () => {
  const { project } = useProject();
  const { t } = useTranslation();
  const resourceResults = resourcesToFetch.map((resourceType) => ({
    type: resourceType,
    // Note: While this is against the rules of hooks, but it's ok here, because
    // we are not using the hook in a loop, but rather in a consistent order.
    // It is important that resourceToFetch is a constant
    // eslint-disable-next-line react-hooks/rules-of-hooks
    ...useResources(resourceType),
  }));

  // Combine all the loading states
  const isLoading = resourceResults.some((result) => result.isLoading);
  const isError = resourceResults.some((result) => result.error);
  const isUpdating = resourceResults.some((result) => result.isUpdating);

  // Build the tree structure with proper prefix handling
  const tree: ResourceTree[] = [];
  const modulesByPrefix: {
    [key: string]: ResourceTree & {
      resourcesByType: { [key: string]: ResourceTree[] };
    };
  } = {};

  resourceResults.forEach(({ type, data }) => {
    if (!data) return;

    const rootLevelResources: ResourceTree[] = [];

    data.forEach((resource) => {
      // Parse the resource format: prefix/type/identifier
      const parts = resource.split('/');
      if (parts.length >= 2) {
        const resourcePrefix = parts[0];

        if (resourcePrefix === project?.prefix) {
          // Same prefix as project - goes to root level
          rootLevelResources.push({
            id: `${type}-${resource}`,
            label: resource,
          });
        } else {
          // Different prefix - it's a module
          if (!modulesByPrefix[resourcePrefix]) {
            modulesByPrefix[resourcePrefix] = {
              id: `modules-${resourcePrefix}`,
              label: resourcePrefix,
              children: [],
              resourcesByType: {},
            };
          }

          // Group module resources by type, just like root level resources
          if (!modulesByPrefix[resourcePrefix].resourcesByType[type]) {
            modulesByPrefix[resourcePrefix].resourcesByType[type] = [];
          }

          modulesByPrefix[resourcePrefix].resourcesByType[type].push({
            id: `${type}-${resource}`,
            label: resource,
          });
        }
      } else {
        // Fallback for resources that don't follow the prefix/type/identifier format
        rootLevelResources.push({
          id: `${type}-${resource}`,
          label: resource,
        });
      }
    });

    // Add root level resources
    if (rootLevelResources.length > 0) {
      tree.push({
        id: type,
        label: t(`resources.${type}`),
        children: rootLevelResources,
      });
    }
  });

  // Convert module resourcesByType to proper tree structure
  Object.values(modulesByPrefix).forEach(
    (
      module: ResourceTree & {
        resourcesByType: { [key: string]: ResourceTree[] };
      },
    ) => {
      module.children = Object.entries(module.resourcesByType).map(
        ([type, resources]) => ({
          id: `${module.id}-${type}`,
          label: t(`resources.${type}`),
          children: resources,
        }),
      );
    },
  );

  // Add modules section if there are any modules
  if (Object.keys(modulesByPrefix).length > 0) {
    tree.push({
      id: 'modules',
      label: t('resources.modules'),
      children: Object.values(modulesByPrefix),
    });
  }

  return {
    data: tree,
    isLoading,
    error: isError,
    isUpdating,
  };
};
