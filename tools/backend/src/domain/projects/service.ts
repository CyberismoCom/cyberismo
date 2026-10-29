// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
