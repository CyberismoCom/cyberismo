// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type ProjectDirectory, type Workspace } from '@cyberismo/data-handler';
import { createMcpServer } from '../src/server.js';
import { authenticated, testDataPath } from './test-utils.js';
import {
  directoryOf,
  openTestWorkspace,
} from './helpers/open-test-workspace.js';

let ws: Workspace;
let client: Client;

/**
 * The project's directory, also listing a project that does not open,
 * simulating a multi-project deployment.
 */
function multiProjectDirectory(cmd: Workspace): ProjectDirectory {
  const directory = directoryOf(cmd);
  return {
    open: (prefix, actor, identity) => directory.open(prefix, actor, identity),
    list: async () => [
      ...(await directory.list()),
      { prefix: 'other', name: 'Other project' },
    ],
  } as ProjectDirectory;
}

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  ws = await openTestWorkspace(testDataPath);

  const server = createMcpServer(multiProjectDirectory(ws));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(authenticated(serverTransport));

  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
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
    const prefixes = parsed.projects.map((p: { prefix: string }) => p.prefix);
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

    // 'other' is listed but does not open
    expect(result.isError).toBe(true);
    const text = contentOf(result)[0].text;
    expect(text).toContain("Unknown project 'other'");
  });
});
