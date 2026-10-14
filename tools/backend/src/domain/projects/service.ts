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

import { SYSTEM_ACTOR, type ProjectDirectory } from '@cyberismo/data-handler';
import type { CreateProjectParams } from '@cyberismo/model';
import { actorOf } from '../../middleware/commandManager.js';
import type { UserInfo } from '../../types.js';

export async function createProject(
  directory: ProjectDirectory,
  params: CreateProjectParams,
  user?: UserInfo | null,
) {
  const { prefix, failures, warnings } = await directory.create(
    params,
    user ? actorOf(user) : SYSTEM_ACTOR,
    user ? { name: user.name, email: user.email } : undefined,
  );
  // The project's path stays on the server.
  return {
    prefix,
    name: params.name,
    category: params.category || undefined,
    description: params.description || undefined,
    failures,
    warnings,
  };
}
