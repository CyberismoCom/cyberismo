/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import useSWR, { mutate } from 'swr';
import { globalApiPaths, callApi } from '../swr';
import type { AvailableProject } from '../projectUtils';
import { useUpdating } from '../hooks';

export const useAvailableProjects = () =>
  useSWR<AvailableProject[]>(globalApiPaths.projects());

export interface CreateProjectParams {
  name: string;
  prefix: string;
  category?: string;
  description?: string;
}

export interface CloneProjectParams {
  url: string;
}

export const useProjectMutations = () => {
  const { call, isUpdating } = useUpdating(globalApiPaths.projects());
  const mutations = {
    isUpdating: (action?: string) => isUpdating(action),
    createProject: (params: CreateProjectParams) =>
      call(() => createProject(params), 'create-project'),
    cloneProject: (params: CloneProjectParams) =>
      call(() => cloneProject(params), 'clone-project'),
  };
  return mutations;
};

export const createProject = async (
  params: CreateProjectParams,
): Promise<{ prefix: string }> => {
  const result = await callApi<{ prefix: string }>(
    globalApiPaths.createProject(),
    'POST',
    params,
  );
  await mutate(globalApiPaths.projects());
  return result;
};

export const cloneProject = async (
  params: CloneProjectParams,
): Promise<{ projects: { prefix: string; name: string }[] }> => {
  const result = await callApi<{
    projects: { prefix: string; name: string }[];
  }>(globalApiPaths.cloneProject(), 'POST', params);
  await mutate(globalApiPaths.projects());
  return result;
};
