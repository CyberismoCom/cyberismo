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
import { projectApiPaths, callApi } from '../swr';
import { useSWRHook } from './common';
import type { GeneralSettings } from './types';
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

export const updateProjectSettings = async (
  body: Partial<Pick<GeneralSettings, 'cardKeyPrefix'>>,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.project(), 'PATCH', body);
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
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

export const deleteProjectModule = async (
  moduleName: string,
  projectPrefix?: string,
) => {
  const apiPaths = projectApiPaths(projectPrefix);
  await callApi(apiPaths.projectModuleDelete(moduleName), 'DELETE');
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
  mutate(apiPaths.templates());
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
};

export const useProjectSettingsMutations = (projectPrefix?: string) => {
  const apiPaths = projectApiPaths(projectPrefix);
  const { call, isUpdating } = useUpdating(apiPaths.project());
  const mutations = {
    isUpdating: (action?: string) => isUpdating(action),
    updateProject: (
      body: Partial<Pick<GeneralSettings, 'name' | 'cardKeyPrefix'>>,
      action: string = 'update',
    ) => call(() => updateProjectSettings(body, projectPrefix), action),
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
  };
  return mutations;
};

export type UseProjectSettingsMutationsReturn = ReturnType<
  typeof useProjectSettingsMutations
>;
