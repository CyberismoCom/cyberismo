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

import { beforeAll, afterAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type Workspace } from '@cyberismo/data-handler';
import { createMcpServer } from '../src/server.js';
import { authenticated, testDataPath } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let ws: Workspace;
let client: Client;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  ws = await openTestWorkspace(testDataPath);

  const server = createMcpServer(directoryOf(ws));
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(authenticated(serverTransport));

  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  ws.checkout.dispose();
});

type TextContent = { type: string; text: string };
const contentOf = (result: Record<string, unknown>) =>
  result.content as TextContent[];

describe('MCP Tools via Client', () => {
  test('refuses calls without an authenticated user, reads included', async () => {
    const server = createMcpServer(directoryOf(ws));
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const anonymous = new Client({ name: 'anonymous', version: '1.0.0' });
    await anonymous.connect(clientTransport);
    try {
      for (const [name, args] of [
        ['list_projects', {}],
        ['get_card', { projectPrefix: 'decision', cardKey: 'decision_5' }],
      ] as const) {
        const result = await anonymous.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        expect(contentOf(result)[0].text).toContain(
          'MCP request has no authenticated user',
        );
      }
    } finally {
      await anonymous.close();
    }
  });

  test('list_projects returns available projects', async () => {
    const result = await client.callTool({
      name: 'list_projects',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.projects)).toBe(true);
    expect(parsed.projects.length).toBe(1);
    expect(parsed.projects[0].prefix).toBe('decision');
  });

  test('get_card returns rendered card data', async () => {
    const result = await client.callTool({
      name: 'get_card',
      arguments: { projectPrefix: 'decision', cardKey: 'decision_5' },
    });

    expect(result.isError).toBeFalsy();
    expect(contentOf(result)).toHaveLength(1);

    const content = contentOf(result)[0];
    expect(content).toHaveProperty('type', 'text');
    const parsed = JSON.parse(content.text);

    expect(parsed.success).toBe(true);
    expect(parsed.card.key).toBe('decision_5');
    expect(parsed.card.title).toBeDefined();
    expect(parsed.card.cardType).toBeDefined();
    expect(parsed.card.workflowState).toBeDefined();
    expect(parsed.card.rawContent).toBeDefined();
    expect(parsed.card.parsedContent).toBeDefined();
    expect(Array.isArray(parsed.card.fields)).toBe(true);
    expect(Array.isArray(parsed.card.availableTransitions)).toBe(true);
    expect(Array.isArray(parsed.card.labels)).toBe(true);
    expect(Array.isArray(parsed.card.links)).toBe(true);
    expect(parsed.card.deniedOperations).toBeDefined();
  });

  test('get_card with raw mode returns basic data', async () => {
    const result = await client.callTool({
      name: 'get_card',
      arguments: {
        projectPrefix: 'decision',
        cardKey: 'decision_5',
        raw: true,
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.card.key).toBe('decision_5');
  });

  test('get_card returns error for invalid key', async () => {
    const result = await client.callTool({
      name: 'get_card',
      arguments: { projectPrefix: 'decision', cardKey: 'nonexistent_key_999' },
    });

    expect(result.isError).toBe(true);
    const text = contentOf(result)[0].text;
    expect(text).toContain('Error getting card');
  });

  test('list_cards returns card tree', async () => {
    const result = await client.callTool({
      name: 'list_cards',
      arguments: { projectPrefix: 'decision' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.cards)).toBe(true);
    expect(parsed.cards.length).toBeGreaterThan(0);
  });

  test('list_templates returns templates', async () => {
    const result = await client.callTool({
      name: 'list_templates',
      arguments: { projectPrefix: 'decision' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.templates)).toBe(true);
  });

  test('list_labels returns labels array', async () => {
    const result = await client.callTool({
      name: 'list_labels',
      arguments: { projectPrefix: 'decision' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.labels)).toBe(true);
  });

  test('run_query with tree returns results', async () => {
    const result = await client.callTool({
      name: 'run_query',
      arguments: { projectPrefix: 'decision', queryName: 'tree' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(contentOf(result)[0].text);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBeGreaterThan(0);
  });
});
