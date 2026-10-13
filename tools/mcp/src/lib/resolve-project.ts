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
  Workspace,
  type Checkout,
  type ProjectProvider,
} from '@cyberismo/data-handler';

export type { ProjectProvider } from '@cyberismo/data-handler';

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
 * The calling user's handle over `checkout`; the MCP client acts as the
 * user's agent.
 * @throws if the request carries no authenticated user.
 */
export function workspaceFor(
  checkout: Checkout,
  auth: RequestAuth,
  server: McpServer,
): Workspace {
  const user = callerOf(auth);
  const client = server.server.getClientVersion()?.name;
  return Workspace.over(
    checkout,
    {
      kind: user.kind,
      id: user.id,
      name: user.name,
      ...(client && { agent: { name: client } }),
    },
    { name: user.name, email: user.email },
  );
}

/**
 * Resolve the caller's handle over the project named by projectPrefix.
 * Throws if the prefix is unknown or no projects are available.
 */
export function resolveCommands(
  provider: ProjectProvider,
  projectPrefix: string,
  auth: RequestAuth,
  server: McpServer,
): Workspace {
  const checkout = provider.get(projectPrefix);
  if (!checkout) {
    const available = provider.list().map((p) => p.prefix);
    throw new Error(
      available.length === 0
        ? 'No projects available.'
        : `Unknown project '${projectPrefix}'. Available projects: ${available.join(', ')}. Ask the user which project to use before retrying.`,
    );
  }
  return workspaceFor(checkout, auth, server);
}
