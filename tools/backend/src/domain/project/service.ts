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

import { HTTPException } from 'hono/http-exception';
import {
  ModuleRequestError,
  redactUserinfo,
  type CleanResult,
  type CommandManager,
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
  commands: CommandManager,
  row: ProjectModuleInfo,
): Promise<ProjectModule> {
  try {
    const data = await commands.modulesCmd.show(row.name);
    return {
      ...row,
      name: data.name || row.name,
      cardKeyPrefix: data.cardKeyPrefix || row.name,
    };
  } catch {
    return { ...row, cardKeyPrefix: row.name };
  }
}

const STATUS = {
  notFound: 404,
  invalid: 400,
  blocked: 409,
  unreachable: 502,
} as const;

async function withModuleErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const message = redactUserinfo(error.message);
    if (error instanceof ModuleRequestError) {
      throw new HTTPException(STATUS[error.reason], { message });
    }
    // eslint-disable-next-line preserve-caught-error -- the original error is dropped so its text stays out of the logs
    throw new Error(message);
  }
}

export async function getProject(
  commands: CommandManager,
): Promise<ProjectInfo> {
  return commands.consistent(async () => {
    const project = await commands.showCmd.showProject();
    const modules = await commands.modulesCmd.inventory();
    const moduleDetails = await Promise.all(
      modules.map((row) => toModuleInfo(commands, row)),
    );

    const gitRemoteUrl = (await commands.showCmd.showGitRemoteUrl()) ?? null;

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
  commands: CommandManager,
  updates: ProjectUpdatePayload,
): Promise<ProjectInfo> {
  const { name, cardKeyPrefix, description, category, gitRemoteUrl } = updates;

  await commands.atomic(async () => {
    if (cardKeyPrefix) {
      await commands.renameCmd.rename(cardKeyPrefix);
    }
    if (name) {
      await commands.project.configuration.setProjectName(name);
    }
    if (description !== undefined) {
      await commands.project.configuration.setDescription(description);
    }
    if (category !== undefined) {
      await commands.project.configuration.setCategory(category);
    }
  }, 'Update project settings');

  if (gitRemoteUrl !== undefined) {
    await commands.editCmd.setGitRemoteUrl(gitRemoteUrl);
  }

  return getProject(commands);
}

export async function updateModule(
  commands: CommandManager,
  module: string,
  range?: string,
) {
  await withModuleErrors(() =>
    commands.modulesCmd.update(range ? { module, range } : { module }),
  );
}

export async function updateAllModules(commands: CommandManager) {
  await withModuleErrors(() => commands.modulesCmd.update({}));
}

export async function getUpdatePlan(
  commands: CommandManager,
): Promise<UpdatePlan> {
  return withModuleErrors(() => commands.modulesCmd.planUpdate({}));
}

export async function listModuleVersions(
  commands: CommandManager,
  target: { module?: string; source?: string },
): Promise<string[]> {
  if (target.source !== undefined) {
    return withModuleErrors(() =>
      commands.modulesCmd.listVersions({ source: target.source! }),
    );
  }
  return withModuleErrors(() =>
    commands.modulesCmd.listVersions({ module: target.module! }),
  );
}

export async function deleteModule(commands: CommandManager, module: string) {
  await commands.removeCmd.remove('module', module);
}

// Hub data is only refreshed on demand, so a project that has never fetched
// would otherwise show an empty catalogue until the user asks for a refresh.
async function populateHubCache(commands: CommandManager) {
  try {
    await commands.fetchCmd.ensureModuleListExists();
  } catch (error) {
    // An unreachable hub must not fail listing the hubs we already know about.
    console.warn('Failed to populate the hub cache', error);
  }
}

export async function getImportableModules(
  commands: CommandManager,
): Promise<ModuleSettingFromHub[]> {
  await populateHubCache(commands);
  return commands.showCmd.showImportableModules(false, true);
}

export async function importModule(
  commands: CommandManager,
  source: string,
  range?: string,
): Promise<void> {
  await withModuleErrors(() =>
    commands.modulesCmd.install(source, range ? { version: range } : undefined),
  );
}

export async function getHubs(commands: CommandManager): Promise<HubInfo[]> {
  await populateHubCache(commands);
  const hubs = await commands.showCmd.showHubDetails();
  const importedModules = new Set(
    (await commands.modulesCmd.list()).map((mod) => mod.name),
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
  commands: CommandManager,
  location: string,
): Promise<HubFetchFailure[]> {
  await commands.createCmd.addHubLocation(location);
  // The hub is configured even when it cannot be reached right now; its
  // modules appear once a later refresh succeeds.
  return commands.fetchCmd.fetchHubs(true);
}

export async function removeHub(commands: CommandManager, location: string) {
  await commands.removeCmd.remove('hub', location);
}

export async function fetchHubs(
  commands: CommandManager,
): Promise<HubFetchFailure[]> {
  return commands.fetchCmd.fetchHubs(true);
}

export async function cleanProject(
  commands: CommandManager,
  dryRun: boolean,
): Promise<CleanResult> {
  return commands.cleanCmd.clean(dryRun);
}
