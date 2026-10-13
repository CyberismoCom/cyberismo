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
  Create,
  openCheckout,
  scanForProjects,
  SYSTEM_ACTOR,
  Workspace,
} from '@cyberismo/data-handler';
import { actorOf } from '../../middleware/commandManager.js';
import type { UserInfo } from '../../types.js';
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
  user?: UserInfo | null,
): Promise<CreateProjectResult> {
  const { name, prefix, category, description } = params;
  const projectPath = join(rootPath, prefix);

  const ws = await Workspace.createProjectWithDefaults(
    projectPath,
    params,
    user ? actorOf(user) : SYSTEM_ACTOR,
    user ? { name: user.name, email: user.email } : undefined,
    registry.options,
  );

  registry.add(prefix, ws.checkout);

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
    registry.add(
      project.prefix,
      await openCheckout(project.path, registry.options),
    );
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
