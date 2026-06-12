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
  type CommandManager,
  type ModuleSettingFromHub,
} from '@cyberismo/data-handler';

export interface ProjectModule {
  name: string;
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
  moduleName: string,
): Promise<ProjectModule> {
  try {
    const data = await commands.showCmd.showModule(moduleName);
    return {
      name: data.name || moduleName,
      cardKeyPrefix: data.cardKeyPrefix || moduleName,
    };
  } catch {
    return {
      name: moduleName,
      cardKeyPrefix: moduleName,
    };
  }
}

export async function getProject(
  commands: CommandManager,
): Promise<ProjectInfo> {
  return commands.consistent(async () => {
    const project = await commands.showCmd.showProject();
    const modules = await commands.showCmd.showModules();
    const moduleDetails = await Promise.all(
      modules.map((mod) => toModuleInfo(commands, mod.name)),
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

export async function updateModule(commands: CommandManager, module: string) {
  await commands.importCmd.updateModule(module);
}

export async function updateAllModules(commands: CommandManager) {
  await commands.importCmd.updateAllModules();
}

export async function deleteModule(commands: CommandManager, module: string) {
  await commands.removeCmd.remove('module', module);
}

export async function getImportableModules(
  commands: CommandManager,
): Promise<ModuleSettingFromHub[]> {
  return commands.showCmd.showImportableModules(false, true);
}

export async function importModule(
  commands: CommandManager,
  source: string,
): Promise<void> {
  await commands.importCmd.importModule(source);
}

export async function getHubs(commands: CommandManager): Promise<HubInfo[]> {
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

export async function addHub(commands: CommandManager, location: string) {
  await commands.createCmd.addHubLocation(location);
}

export async function removeHub(commands: CommandManager, location: string) {
  await commands.removeCmd.remove('hub', location);
}

export async function fetchHubs(commands: CommandManager) {
  await commands.fetchCmd.fetchHubs(true);
}
