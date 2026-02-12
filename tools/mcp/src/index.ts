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

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CommandManager } from '@cyberismo/data-handler';
import { getProjectPath } from './config.js';
import { createMcpServer } from './server.js';

// Re-export the server factory for use by backend/HTTP integration
export { createMcpServer } from './server.js';
export type { McpServerOptions } from './server.js';

/**
 * Start the MCP server with stdio transport for a Cyberismo project.
 * This is the entry point for CLI usage (cyberismo mcp command).
 *
 * @param projectPath - Path to the Cyberismo project (optional, will auto-detect if not provided)
 */
export async function startMcpServer(projectPath?: string): Promise<void> {
  const resolvedPath = projectPath || getProjectPath();

  if (!resolvedPath) {
    throw new Error(
      'No Cyberismo project found. Set CYBERISMO_PROJECT_PATH environment variable or provide a project path.',
    );
  }

  // Initialize CommandManager
  const commands = await CommandManager.getInstance(resolvedPath);

  // Create MCP server using factory
  const server = createMcpServer(commands);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  const shutdown = async () => {
    await server.close();
    commands.project.dispose();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// Run directly if this is the entry point
const isDirectRun = import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  startMcpServer().catch((error) => {
    console.error(
      'Fatal error:',
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
}
