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

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  ProjectNotFoundError,
  type CommitIdentity,
  type ProjectDirectory,
  type Workspace,
} from '@cyberismo/data-handler';
import type { ActorRef } from '@cyberismo/model';

/** The authenticated user an MCP host puts in `AuthInfo.extra.user`. */
export interface McpUser {
  id: string;
  name: string;
  email: string;
  kind: 'user' | 'connector';
}

/** The part of a request's context that names who is calling. */
export interface RequestAuth {
  authInfo?: AuthInfo;
}

/**
 * The authenticated user of a request.
 * @throws if the request carries no authenticated user.
 */
export function callerOf({ authInfo }: RequestAuth): McpUser {
  const user = authInfo?.extra?.user as McpUser | undefined;
  if (!user) {
    throw new Error('MCP request has no authenticated user');
  }
  return user;
}

/**
 * The authenticated user of a request as an actor, with their git identity;
 * the MCP client acts as the user's agent.
 * @throws if the request carries no authenticated user.
 */
export function actorOf(
  auth: RequestAuth,
  server: McpServer,
): [ActorRef, CommitIdentity] {
  const user = callerOf(auth);
  const client = server.server.getClientVersion()?.name;
  return [
    {
      kind: user.kind,
      id: user.id,
      name: user.name,
      ...(client && { agent: { name: client } }),
    },
    { name: user.name, email: user.email },
  ];
}

/**
 * Resolve the caller's handle over the project named by projectPrefix.
 * @throws if the request carries no authenticated user, or the prefix is
 *   unknown or no projects are available.
 */
export async function resolveWorkspace(
  directory: ProjectDirectory,
  projectPrefix: string,
  auth: RequestAuth,
  server: McpServer,
): Promise<Workspace> {
  try {
    return await directory.open(projectPrefix, ...actorOf(auth, server));
  } catch (error) {
    if (!(error instanceof ProjectNotFoundError)) {
      throw error;
    }
    const available = (await directory.list()).map((p) => p.prefix);
    throw new Error(
      available.length === 0
        ? 'No projects available.'
        : `Unknown project '${projectPrefix}'. Available projects: ${available.join(', ')}. Ask the user which project to use before retrying.`,
      { cause: error },
    );
  }
}
