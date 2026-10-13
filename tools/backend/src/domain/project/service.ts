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

import {
  type CleanResult,
  type Workspace,
  type HubFetchFailure,
  type ModuleSettingFromHub,
  type ProjectModuleInfo,
  type UpdatePlan,
} from '@cyberismo/data-handler';

export type { CleanResult } from '@cyberismo/data-handler';

// Never carries the module's source location.
export interface ProjectModule extends ProjectModuleInfo {
  cardKeyPrefix: string;
}

export interface ProjectInfo {
  name: string;
  cardKeyPrefix: string;
  description: string;
  category: string;
  modules: ProjectModule[];
  gitRemoteUrl: string | null;
}

export interface ProjectUpdatePayload {
  name?: string;
  cardKeyPrefix?: string;
  description?: string;
  category?: string;
  gitRemoteUrl?: string;
}

export interface HubModuleInfo {
  name: string;
  displayName?: string;
  location: string;
  imported: boolean;
}

export interface HubInfo {
  location: string;
  displayName?: string;
  description?: string;
  modules: HubModuleInfo[];
}

async function toModuleInfo(
  ws: Workspace,
  row: ProjectModuleInfo,
): Promise<ProjectModule> {
  try {
    const data = await ws.modulesCmd.show(row.name);
    return {
      ...row,
      name: data.name || row.name,
      cardKeyPrefix: data.cardKeyPrefix || row.name,
    };
  } catch {
    return { ...row, cardKeyPrefix: row.name };
  }
}

export async function getProject(ws: Workspace): Promise<ProjectInfo> {
  return ws.consistent(async () => {
    const project = await ws.showCmd.showProject();
    const modules = await ws.modulesCmd.inventory();
    const moduleDetails = await Promise.all(
      modules.map((row) => toModuleInfo(ws, row)),
    );

    const gitRemoteUrl = (await ws.showCmd.showGitRemoteUrl()) ?? null;

    return {
      name: project.name,
      cardKeyPrefix: project.prefix,
      description: project.description ?? '',
      category: project.category ?? '',
      modules: moduleDetails,
      gitRemoteUrl,
    };
  });
}

export async function updateProject(
  ws: Workspace,
  updates: ProjectUpdatePayload,
): Promise<ProjectInfo> {
  const { name, cardKeyPrefix, description, category, gitRemoteUrl } = updates;

  await ws.atomic(async () => {
    if (cardKeyPrefix) {
      await ws.renameCmd.rename(cardKeyPrefix);
    }
    if (name) {
      await ws.checkout.configuration.setProjectName(name);
    }
    if (description !== undefined) {
      await ws.checkout.configuration.setDescription(description);
    }
    if (category !== undefined) {
      await ws.checkout.configuration.setCategory(category);
    }
  }, 'Update project settings');

  if (gitRemoteUrl !== undefined) {
    await ws.editCmd.setGitRemoteUrl(gitRemoteUrl);
  }

  return getProject(ws);
}

export async function updateModule(
  ws: Workspace,
  module: string,
  range?: string,
) {
  await ws.modulesCmd.update(range ? { module, range } : { module });
}

export async function updateAllModules(ws: Workspace) {
  await ws.modulesCmd.update({});
}

export async function getUpdatePlan(ws: Workspace): Promise<UpdatePlan> {
  return ws.modulesCmd.planUpdate({});
}

export async function listModuleVersions(
  ws: Workspace,
  target: { module?: string; source?: string },
): Promise<string[]> {
  return ws.modulesCmd.listVersions(
    target.source !== undefined
      ? { source: target.source }
      : { module: target.module! },
  );
}

export async function deleteModule(ws: Workspace, module: string) {
  await ws.removeCmd.remove('module', module);
}

// Hub data is only refreshed on demand, so a project that has never fetched
// would otherwise show an empty catalogue until the user asks for a refresh.
async function populateHubCache(ws: Workspace) {
  try {
    await ws.fetchCmd.ensureModuleListExists();
  } catch (error) {
    // An unreachable hub must not fail listing the hubs we already know about.
    console.warn('Failed to populate the hub cache', error);
  }
}

export async function getImportableModules(
  ws: Workspace,
): Promise<ModuleSettingFromHub[]> {
  await populateHubCache(ws);
  return ws.showCmd.showImportableModules(false, true);
}

export async function importModule(
  ws: Workspace,
  source: string,
  range?: string,
): Promise<void> {
  await ws.modulesCmd.install(source, range ? { version: range } : undefined);
}

export async function getHubs(ws: Workspace): Promise<HubInfo[]> {
  await populateHubCache(ws);
  const hubs = await ws.showCmd.showHubDetails();
  const importedModules = new Set(
    (await ws.modulesCmd.list()).map((mod) => mod.name),
  );
  return hubs.map((hub) => ({
    location: hub.location,
    displayName: hub.displayName,
    description: hub.description,
    modules: hub.modules.map((mod) => ({
      name: mod.name,
      displayName: mod.displayName,
      location: mod.location,
      imported: importedModules.has(mod.name),
    })),
  }));
}

export async function addHub(
  ws: Workspace,
  location: string,
): Promise<HubFetchFailure[]> {
  await ws.createCmd.addHubLocation(location);
  // The hub is configured even when it cannot be reached right now; its
  // modules appear once a later refresh succeeds.
  return ws.fetchCmd.fetchHubs(true);
}

export async function removeHub(ws: Workspace, location: string) {
  await ws.removeCmd.remove('hub', location);
}

export async function fetchHubs(ws: Workspace): Promise<HubFetchFailure[]> {
  return ws.fetchCmd.fetchHubs(true);
}

export async function cleanProject(
  ws: Workspace,
  dryRun: boolean,
): Promise<CleanResult> {
  return ws.cleanCmd.clean(dryRun);
}
