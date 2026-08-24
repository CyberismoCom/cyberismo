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
import useSWR, { mutate } from 'swr';
import type {
  CleanResult,
  ModuleSettingFromHub,
} from '@cyberismo/data-handler';
import { projectApiPaths, callApi } from '../swr';
import { useSWRHook } from './common';
import type { Hub, HubFetchResult, ProjectSettingsUpdate } from './types';
import { useUpdating } from '../hooks';

export const useProjectSettings = (
  options?: SWRConfiguration,
  projectPrefix?: string,
) =>
  useSWRHook<'general'>(
    projectApiPaths(projectPrefix).project(),
    'general',
    null,
    options,
  );

export const useProjectReadOnlyMode = (projectPrefix?: string): boolean => {
  let swrKey: string | null;
  try {
    swrKey = projectApiPaths(projectPrefix).project();
  } catch {
    // No project in the URL, so nothing can be read-only.
    swrKey = null;
  }
  const { general } = useSWRHook<'general'>(swrKey, 'general', null);
  return general?.readOnlyMode ?? false;
};

export const updateProjectSettings = async (
  body: ProjectSettingsUpdate,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.project(), 'PATCH', body);
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
};

export const setProjectReadOnlyMode = async (
  readOnlyMode: boolean,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.projectReadOnly(), 'PUT', { readOnlyMode });
  mutate(apiPaths.project());
};

export const updateProjectModule = async (
  moduleName: string,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.projectModuleUpdate(moduleName), 'POST');
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
};

/**
 * Reports the dormant field values a project holds - stored, but not shown and
 * not visible to logic programs - and, unless `dryRun` is set, removes them.
 */
export const cleanProject = async (
  dryRun: boolean,
  projectPrefix?: string,
): Promise<CleanResult> => {
  const apiPaths = projectApiPaths(projectPrefix);
  const result = await callApi<CleanResult>(apiPaths.projectClean(), 'POST', {
    dryRun,
  });
  if (!dryRun) {
    const cardsKey = apiPaths.cards();
    mutate((key) => typeof key === 'string' && key.startsWith(cardsKey));
    // Tree columns are calculated from the stored field values.
    mutate(apiPaths.tree());
  }
  return result;
};

export const useProjectModulesImportable = (projectPrefix?: string) =>
  useSWR<ModuleSettingFromHub[]>(
    projectPrefix
      ? projectApiPaths(projectPrefix).projectModulesImportable()
      : null,
  );

export const deleteProjectModule = async (
  moduleName: string,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.projectModuleDelete(moduleName), 'DELETE');
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
  mutate(apiPaths.templates());
  mutate(apiPaths.projectHubs());
};

export const updateAllProjectModules = async (projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.projectModulesUpdate(), 'POST');
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
};

export const addModule = async (source: string, projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.projectModulesAdd(), 'POST', { source });
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
  mutate(apiPaths.templates());
  mutate(apiPaths.projectModulesImportable());
  mutate(apiPaths.projectHubs());
};

export const useHubs = (projectPrefix?: string) =>
  useSWR<Hub[]>(projectApiPaths(projectPrefix).projectHubs());

export const addHub = async (location: string, projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const result = await callApi<HubFetchResult>(apiPaths.projectHubs(), 'POST', {
    location,
  });
  mutate(apiPaths.projectHubs());
  mutate(apiPaths.projectModulesImportable());
  return result.unreachable ?? [];
};

export const removeHub = async (location: string, projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.projectHubDelete(location), 'DELETE');
  mutate(apiPaths.projectHubs());
  mutate(apiPaths.projectModulesImportable());
};

export const fetchHubs = async (projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const result = await callApi<HubFetchResult>(
    apiPaths.projectHubsFetch(),
    'POST',
  );
  mutate(apiPaths.projectHubs());
  mutate(apiPaths.projectModulesImportable());
  return result.unreachable ?? [];
};

export const useProjectSettingsMutations = (projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const { call, isUpdating } = useUpdating(apiPaths.project());
  const mutations = {
    isUpdating: (action?: string) => isUpdating(action),
    updateProject: (body: ProjectSettingsUpdate, action: string = 'update') =>
      call(() => updateProjectSettings(body, projectPrefix), action),
    setReadOnlyMode: (readOnlyMode: boolean) =>
      call(
        () => setProjectReadOnlyMode(readOnlyMode, projectPrefix),
        'update-readOnlyMode',
      ),
    updateModule: (moduleName: string) =>
      call(
        () => updateProjectModule(moduleName, projectPrefix),
        `update-${moduleName}`,
      ),
    deleteModule: (moduleName: string) =>
      call(
        () => deleteProjectModule(moduleName, projectPrefix),
        `delete-${moduleName}`,
      ),
    updateAllModules: () =>
      call(() => updateAllProjectModules(projectPrefix), 'update-all-modules'),
    addModule: (source: string) =>
      call(() => addModule(source, projectPrefix), 'add-module'),
    addHub: (location: string) =>
      call(() => addHub(location, projectPrefix), 'add-hub'),
    removeHub: (location: string) =>
      call(() => removeHub(location, projectPrefix), `delete-hub-${location}`),
    fetchHubs: () => call(() => fetchHubs(projectPrefix), 'update-hubs'),
  };
  return mutations;
};

export type UseProjectSettingsMutationsReturn = ReturnType<
  typeof useProjectSettingsMutations
>;
