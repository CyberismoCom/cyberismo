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

import { type CommandManager } from '@cyberismo/data-handler';

export interface ProjectModule {
  name: string;
  cardKeyPrefix: string;
}

export interface ProjectInfo {
  name: string;
  cardKeyPrefix: string;
  modules: ProjectModule[];
}

export interface ProjectUpdatePayload {
  name?: string;
  cardKeyPrefix?: string;
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
  const project = await commands.showCmd.showProject();
  const modules = await commands.showCmd.showModules();
  const moduleDetails = await Promise.all(
    modules.map((mod) => toModuleInfo(commands, mod)),
  );

  return {
    name: project.name,
    cardKeyPrefix: project.prefix,
    modules: moduleDetails,
  };
}

export async function updateProject(
  commands: CommandManager,
  updates: ProjectUpdatePayload,
): Promise<ProjectInfo> {
  const { name, cardKeyPrefix } = updates;

  if (cardKeyPrefix) {
    await commands.renameCmd.rename(cardKeyPrefix);
  }
  if (name) {
    await commands.project.configuration.setProjectName(name);
  }

  return getProject(commands);
}

export async function updateModule(commands: CommandManager, module: string) {
  await commands.importCmd.updateModule(module);
}

export async function deleteModule(commands: CommandManager, module: string) {
  await commands.removeCmd.remove('module', module);
}
