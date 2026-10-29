// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { getSwrConfig, globalApiPaths } from './swr.js';

// Mirrors ProjectSummary from @cyberismo/model
export type AvailableProject = {
  prefix: string;
  name: string;
  category?: string;
  description?: string;
  readOnly?: boolean;
};

/**
 * Fetch the list of available projects from the backend.
 */
export async function fetchAvailableProjects(): Promise<AvailableProject[]> {
  const { fetcher } = getSwrConfig();
  const response = (await fetcher!(globalApiPaths.projects())) as {
    projects: AvailableProject[];
    canCreateProjects: boolean;
  };
  return response?.projects ?? [];
}
