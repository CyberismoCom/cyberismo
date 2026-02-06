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
import {
  registerResources,
  registerResourceTemplates,
} from './resources/index.js';
import { registerTools } from './tools/index.js';

export interface McpServerOptions {
  name?: string;
  version?: string;
}

/**
 * Create an MCP server with all Cyberismo resources and tools registered.
 * The caller is responsible for connecting a transport (stdio, HTTP, etc.)
 *
 * @param commands - CommandManager instance for the project
 * @param options - Optional server name and version
 * @returns Configured McpServer instance (not yet connected)
 */
export function createMcpServer(
  commands: CommandManager,
  options?: McpServerOptions,
): McpServer {
  const server = new McpServer({
    name: options?.name ?? 'cyberismo',
    version: options?.version ?? '1.0.0',
  });

  // Register resources and tools
  registerResources(server, commands);
  registerResourceTemplates(server, commands);
  registerTools(server, commands);

  return server;
}
