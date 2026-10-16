// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import useSWR, { mutate } from 'swr';
import { globalApiPaths, callApi } from '../swr';
import type { AvailableProject } from '../projectUtils';
import { useUpdating } from '../hooks';

export interface ProjectsResponse {
  projects: AvailableProject[];
  canCreateProjects: boolean;
}

export const useAvailableProjects = () =>
  useSWR<ProjectsResponse>(globalApiPaths.projects());

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
