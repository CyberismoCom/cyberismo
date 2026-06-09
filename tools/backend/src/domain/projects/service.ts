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

import { join } from 'node:path';
import {
  CommandManager,
  Create,
  scanForProjects,
} from '@cyberismo/data-handler';
import type { ProjectRegistry } from '../../project-registry.js';

export interface CreateProjectParams {
  name: string;
  prefix: string;
  category?: string;
  description?: string;
}

export interface CreateProjectResult {
  prefix: string;
  name: string;
  category?: string;
  description?: string;
}

export async function createProject(
  registry: ProjectRegistry,
  rootPath: string,
  params: CreateProjectParams,
  user?: { name: string; email: string } | null,
): Promise<CreateProjectResult> {
  const { name, prefix, category, description } = params;
  const projectPath = join(rootPath, prefix);

  const commands = await CommandManager.createProjectWithDefaults(
    projectPath,
    params,
    {
      ...registry.options,
      gitUser: user ?? undefined,
    },
  );

  registry.add(prefix, commands);

  return {
    prefix,
    name,
    category: category || undefined,
    description: description || undefined,
  };
}

export interface CloneProjectResult {
  projects: { prefix: string; name: string }[];
  skippedDuplicates?: string[];
}

export async function cloneProject(
  registry: ProjectRegistry,
  rootPath: string,
  url: string,
): Promise<CloneProjectResult> {
  const clonedPath = await Create.cloneProject(url, rootPath);
  const scanned = await scanForProjects(clonedPath);

  const registered: { prefix: string; name: string }[] = [];
  const skippedDuplicates: string[] = [];

  for (const project of scanned) {
    if (registry.has(project.prefix)) {
      skippedDuplicates.push(project.prefix);
      continue;
    }
    const commands = new CommandManager(project.path, registry.options);
    await commands.initialize();
    registry.add(project.prefix, commands);
    registered.push({
      prefix: project.prefix,
      name: project.name,
    });
  }

  return {
    projects: registered,
    ...(skippedDuplicates.length > 0 && { skippedDuplicates }),
  };
}
