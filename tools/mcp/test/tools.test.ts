// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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

describe('undeclared tool arguments', () => {
  // Paths of object schemas under `schema` that declare properties but allow
  // other keys.
  const openObjects = (schema: unknown, path: string): string[] => {
    if (typeof schema !== 'object' || schema === null) return [];
    const node = schema as Record<string, unknown>;
    const open =
      Object.keys(node.properties ?? {}).length > 0 &&
      node.additionalProperties !== false;
    return [
      ...(open ? [path] : []),
      ...Object.entries(node).flatMap(([key, value]) =>
        openObjects(value, `${path}.${key}`),
      ),
    ];
  };

  test('every listed input schema refuses them', async () => {
    // Listed as an empty object until its union input is replaced.
    const exempt = new Set(['update_file_resource']);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('create_card');
    const open = tools
      .filter((tool) => !exempt.has(tool.name))
      .flatMap((tool) => openObjects(tool.inputSchema, tool.name));
    expect(open).toEqual([]);
  });

  test('a misnamed argument fails the call', async () => {
    const result = await client.callTool({
      name: 'create_card',
      arguments: {
        projectPrefix: 'decision',
        template: 'decision/templates/simplepage',
        parentCardKey: 'decision_5',
      },
    });
    expect(result.isError).toBe(true);
    expect(contentOf(result)[0].text).toContain(
      'Unrecognized key: "parentCardKey"',
    );
  });

  test('an undeclared key in a union-typed input fails the call', async () => {
    const result = await client.callTool({
      name: 'update_file_resource',
      arguments: {
        projectPrefix: 'decision',
        resource: 'decision/workflows/simple',
        key: 'displayName',
        operation: { name: 'change', target: '', to: 'Renamed' },
        extra: true,
      },
    });
    expect(result.isError).toBe(true);
    expect(contentOf(result)[0].text).toContain('Invalid arguments');
  });
});
