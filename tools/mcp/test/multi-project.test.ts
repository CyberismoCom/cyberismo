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

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CommandManager } from '@cyberismo/data-handler';
import { createMcpServer } from '../src/server.js';
import type { ProjectProvider } from '../src/lib/resolve-project.js';
import { testDataPath } from './test-utils.js';

let commands: CommandManager;
let client: Client;

/**
 * A provider that exposes the same project under two prefixes,
 * simulating a multi-project deployment.
 */
function multiProjectProvider(cmd: CommandManager): ProjectProvider {
  const realPrefix = cmd.project.configuration.cardKeyPrefix;
  return {
    get: (prefix: string) => (prefix === realPrefix ? cmd : undefined),
    list: () => [
      { prefix: realPrefix, name: cmd.project.configuration.name },
      { prefix: 'other', name: 'Other project' },
    ],
  };
}

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  commands = await CommandManager.getInstance(testDataPath);

  const server = createMcpServer(multiProjectProvider(commands));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  commands.project.dispose();
});

type TextContent = { type: string; text: string };
const contentOf = (result: Record<string, unknown>) =>
  result.content as TextContent[];

describe('Multi-project MCP', () => {
  test('projectPrefix is required (no default) with multiple projects', async () => {
    const tools = await client.listTools();
    const listCards = tools.tools.find((t) => t.name === 'list_cards');
    expect(listCards).toBeDefined();

    const schema = listCards!.inputSchema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    // With multiple projects, projectPrefix should be required (no default)
    expect(schema.required).toContain('projectPrefix');
  });

  test('list_projects returns both projects', async () => {
    const result = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.projects).toHaveLength(2);
    const prefixes = parsed.projects.map(
      (p: { prefix: string }) => p.prefix,
    );
    expect(prefixes).toContain('decision');
    expect(prefixes).toContain('other');
  });

  test('tool call with valid prefix succeeds', async () => {
    const result = await client.callTool({
      name: 'list_cards',
      arguments: { projectPrefix: 'decision' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.cards)).toBe(true);
  });

  test('tool call with unknown prefix returns error', async () => {
    const result = await client.callTool({
      name: 'list_cards',
      arguments: { projectPrefix: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    const text = contentOf(result)[0].text;
    expect(text).toContain("Unknown project 'nonexistent'");
  });

  test('tool call for fake project prefix returns error', async () => {
    const result = await client.callTool({
      name: 'list_cards',
      arguments: { projectPrefix: 'other' },
    });

    // 'other' is listed but provider.get returns undefined for it
    expect(result.isError).toBe(true);
    const text = contentOf(result)[0].text;
    expect(text).toContain("Unknown project 'other'");
  });
});
