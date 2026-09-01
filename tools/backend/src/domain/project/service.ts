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
  type CommandManager,
  type HubFetchFailure,
  type ModuleInfo,
  type ModuleSetting,
  type ModuleSettingFromHub,
  type UpdatePreview,
} from '@cyberismo/data-handler';

export type { CleanResult, UpdatePreview } from '@cyberismo/data-handler';

export interface ProjectModule {
  name: string;
  cardKeyPrefix: string;
  installedVersion?: string;
  /** Range this project declares; absent for transitive modules. */
  declaredRange?: string;
  /** True for modules the project declares itself; false for transitives. */
  isRoot: boolean;
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
  module: ModuleInfo,
  declared?: ModuleSetting,
): Promise<ProjectModule> {
  const versionInfo = {
    ...(module.version !== undefined
      ? { installedVersion: module.version }
      : {}),
    ...(declared?.version !== undefined
      ? { declaredRange: declared.version }
      : {}),
    isRoot: declared !== undefined,
  };
  try {
    const data = await commands.showCmd.showModule(module.name);
    return {
      name: data.name || module.name,
      cardKeyPrefix: data.cardKeyPrefix || module.name,
      ...versionInfo,
    };
  } catch {
    return {
      name: module.name,
      cardKeyPrefix: module.name,
      ...versionInfo,
    };
  }
}

export async function getProject(
  commands: CommandManager,
): Promise<ProjectInfo> {
  return commands.consistent(async () => {
    const project = await commands.showCmd.showProject();
    const modules = await commands.showCmd.showModules();
    const declaredByName = new Map(
      commands.project.configuration.modules.map((mod) => [mod.name, mod]),
    );
    const moduleDetails = await Promise.all(
      modules.map((mod) =>
        toModuleInfo(commands, mod, declaredByName.get(mod.name)),
      ),
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
  version?: string,
) {
  await commands.importCmd.updateModule(module, undefined, version);
}

export async function updateAllModules(commands: CommandManager) {
  await commands.importCmd.updateAllModules();
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
  version?: string,
): Promise<void> {
  await commands.importCmd.importModule(
    source,
    version !== undefined ? { version } : undefined,
  );
}

export async function listModuleVersions(
  commands: CommandManager,
  target: { source?: string; module?: string },
): Promise<string[]> {
  let location = target.source;
  if (target.module !== undefined) {
    const declared = commands.project.configuration.modules.find(
      (mod) => mod.name === target.module,
    );
    if (!declared) {
      throw new Error(`Module '${target.module}' is not part of the project`);
    }
    if (declared.private) {
      throw new Error(
        `Module '${target.module}' is private; listing versions of private modules is not supported`,
      );
    }
    location = declared.location;
  }
  if (location === undefined) {
    throw new Error('Either a source or a module name is required');
  }
  return commands.checkUpdatesCmd.availableVersions(location);
}

export async function getUpdatePlan(
  commands: CommandManager,
  module?: string,
  version?: string,
): Promise<UpdatePreview> {
  return commands.checkUpdatesCmd.previewUpdate(module, version);
}

export async function getHubs(commands: CommandManager): Promise<HubInfo[]> {
  await populateHubCache(commands);
  const hubs = await commands.showCmd.showHubDetails();
  const importedModules = new Set(
    (await commands.showCmd.showModules()).map((mod) => mod.name),
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
