// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ProjectDirectory } from '@cyberismo/data-handler';
import { registerResources } from './resources/index.js';
import { registerTools } from './tools/index.js';
import { registerPrompts } from './prompts/index.js';
import packageJson from '../package.json' with { type: 'json' };

export interface McpServerOptions {
  name?: string;
  version?: string;
}

/**
 * Create an MCP server with all Cyberismo resources and tools registered.
 * The caller is responsible for connecting a transport (stdio, HTTP, etc.)
 *
 * The AI must call list_projects to discover available projects and pass
 * projectPrefix to every tool call.
 */
export function createMcpServer(
  directory: ProjectDirectory,
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

  registerResources(server, directory);
  registerTools(server, directory);
  registerPrompts(server, directory);

  return server;
}
