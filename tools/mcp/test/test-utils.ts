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

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CommandManager } from '@cyberismo/data-handler';
import { createMcpServer, singleProjectProvider } from '../src/server.js';
import type { ProjectProvider } from '../src/lib/resolve-project.js';

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

export const testDataPath = path.resolve(
  dirname,
  '../../data-handler/test/test-data/valid/decision-records',
);

export type TextContent = { type: string; text: string };

/** Text content items of an MCP tool result. */
export const contentOf = (result: Record<string, unknown>) =>
  result.content as TextContent[];

/** Parsed JSON payload of an MCP tool result's first text item. */
export const parseResult = (result: Record<string, unknown>) =>
  JSON.parse(contentOf(result)[0].text);

export interface McpTestContext {
  client: Client;
  commands: CommandManager;
  /** Closes the client and disposes the project. Call in afterAll. */
  cleanup: () => Promise<void>;
}

/**
 * Boots a CommandManager and a connected in-memory MCP client for tests.
 * @param options.projectPath project to load (defaults to the shared
 *        read-only fixture; pass an isolated copy for mutating suites)
 * @param options.provider custom provider factory (defaults to
 *        singleProjectProvider)
 */
export async function setupMcpTest(options?: {
  projectPath?: string;
  provider?: (commands: CommandManager) => ProjectProvider;
}): Promise<McpTestContext> {
  // Fixes weird issue with asciidoctor
  process.argv = [];
  const commands = await CommandManager.getInstance(
    options?.projectPath ?? testDataPath,
  );

  const server = createMcpServer(
    options?.provider?.(commands) ?? singleProjectProvider(commands),
  );
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    commands,
    cleanup: async () => {
      await client.close();
      commands.project.dispose();
    },
  };
}
