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
import { useSWRHook } from './common';
import type { GeneralSettings } from './types';
import { useUpdating } from '../hooks';

export const useProjectSettings = (options?: SWRConfiguration) =>
  useSWRHook<'general'>(apiPaths.project(), 'general', null, options);

export const updateProjectSettings = async (
  body: Partial<Pick<GeneralSettings, 'cardKeyPrefix'>>,
) => {
  await callApi(apiPaths.project(), 'PATCH', body);
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
};

export const updateProjectModule = async (moduleName: string) => {
  await callApi(apiPaths.projectModuleUpdate(moduleName), 'POST');
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
};

export const deleteProjectModule = async (moduleName: string) => {
  await callApi(apiPaths.projectModuleDelete(moduleName), 'DELETE');
  mutate(apiPaths.project());
  mutate(apiPaths.resourceTree());
};

export const useProjectSettingsMutations = () => {
  const { call, isUpdating } = useUpdating(apiPaths.project());
  const mutations = {
    isUpdating: (action?: string) => isUpdating(action),
    updateProject: (
      body: Partial<Pick<GeneralSettings, 'name' | 'cardKeyPrefix'>>,
      action: string = 'update',
    ) => call(() => updateProjectSettings(body), action),
    updateModule: (moduleName: string) =>
      call(() => updateProjectModule(moduleName), `update-${moduleName}`),
    deleteModule: (moduleName: string) =>
      call(() => deleteProjectModule(moduleName), `delete-${moduleName}`),
    updateAllModules: (moduleNames: string[]) =>
      call(
        async () => {
          for (const moduleName of moduleNames) {
            // Ensure modules are updated sequentially to avoid backend conflicts
            await updateProjectModule(moduleName);
          }
        },
        'update-all-modules',
      ),
  };
  return mutations;
};

export type UseProjectSettingsMutationsReturn = ReturnType<
  typeof useProjectSettingsMutations
>;
