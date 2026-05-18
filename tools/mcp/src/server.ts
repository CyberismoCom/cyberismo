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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CommandManager } from '@cyberismo/data-handler';
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';
import type { ProjectProvider } from './lib/resolve-project.js';
import packageJson from '../package.json' with { type: 'json' };

export type { ProjectProvider } from './lib/resolve-project.js';

export interface McpServerOptions {
  name?: string;
  version?: string;
}

/**
 * Wrap a single CommandManager in a minimal ProjectProvider.
 */
export function singleProjectProvider(
  commands: CommandManager,
): ProjectProvider {
  const prefix = commands.project.configuration.cardKeyPrefix;
  const name = commands.project.configuration.name;
  return {
    get: (p: string) => (p === prefix ? commands : undefined),
    list: () => [{ prefix, name }],
  };
}

/**
 * Create an MCP server with all Cyberismo resources and tools registered.
 * The caller is responsible for connecting a transport (stdio, HTTP, etc.)
 *
 * The AI must call list_projects to discover available projects and pass
 * projectPrefix to every tool call.
 */
export function createMcpServer(
  provider: ProjectProvider,
  options?: McpServerOptions,
): McpServer {
  const instructions =
    'Call list_projects to discover available projects. Pass projectPrefix to every tool call.';

  const server = new McpServer(
    {
      name: options?.name ?? 'cyberismo',
      version: options?.version ?? packageJson.version,
    },
    { instructions },
  );

  registerResources(server, provider);
  registerTools(server, provider);

  return server;
}
