// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// Tools reject arguments they do not declare, so that a misnamed argument is
// an error rather than a silently different action (INTDEV-1455).

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Workspace } from '@cyberismo/data-handler';
import { createMcpServer } from '../src/server.js';
import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';
import { authenticated } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let project: BuiltProject;
let ws: Workspace;
let client: Client;
let parent: string;

beforeAll(async () => {
  project = await buildProject({
    templates: [{ name: 'page', cards: [{ title: 'Template page' }] }],
    cards: [{ title: 'Parent' }],
  });
  [parent] = project.keys;
  ws = await openTestWorkspace(project.path);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await createMcpServer(directoryOf(ws)).connect(
    authenticated(serverTransport),
  );
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await project.cleanup();
});

const callTool = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({
    name,
    arguments: { projectPrefix: 'test', ...args },
  });
  return {
    isError: result.isError,
    text: (result.content as { text: string }[])[0].text,
  };
};

interface TreeNode {
  key: string;
  children?: TreeNode[];
}
// Keys of all cards, from list_cards.
const cardKeys = async (): Promise<string[]> => {
  const { cards } = JSON.parse((await callTool('list_cards', {})).text);
  const keys = (nodes: TreeNode[] = []): string[] =>
    nodes.flatMap((node) => [node.key, ...keys(node.children)]);
  return keys(cards);
};
const childKeys = async (key: string): Promise<string[]> => {
  const { cards } = JSON.parse((await callTool('list_cards', {})).text);
  return (
    (cards as TreeNode[]).find((node) => node.key === key)?.children ?? []
  ).map((node) => node.key);
};

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  additionalProperties?: unknown;
  [key: string]: unknown;
};

// Paths of the object schemas under `schema` that declare properties but
// allow undeclared keys. A tool without arguments (list_projects) has nothing
// to misname, and the SDK lists it as an empty object.
function openObjects(schema: unknown, path: string): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, i) => openObjects(item, `${path}[${i}]`));
  }
  if (typeof schema !== 'object' || schema === null) return [];
  const node = schema as JsonSchema;
  const own =
    Object.keys(node.properties ?? {}).length > 0 &&
    node.additionalProperties !== false
      ? [path]
      : [];
  return [
    ...own,
    ...Object.entries(node).flatMap(([key, value]) =>
      openObjects(value, `${path}.${key}`),
    ),
  ];
}

describe('MCP tool arguments', () => {
  test('every listed tool input schema refuses undeclared keys', async () => {
    // update_file_resource's input is a union, which the SDK lists as an
    // empty object; INTDEV-1410 gives it a listable schema. Its calls are
    // still validated strictly (see below).
    const exempt = new Set(['update_file_resource']);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain('create_card');
    const open = tools
      .filter((tool) => !exempt.has(tool.name))
      .flatMap((tool) => openObjects(tool.inputSchema, tool.name));
    expect(open).toEqual([]);
  });

  test('create_card with a misnamed parent key fails and creates nothing', async () => {
    const before = await cardKeys();
    const result = await callTool('create_card', {
      template: 'test/templates/page',
      parentCardKey: parent,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Unrecognized key: "parentCardKey"');
    expect(await cardKeys()).toEqual(before);
  });

  test('create_card with parentKey creates the card under the parent', async () => {
    const result = await callTool('create_card', {
      template: 'test/templates/page',
      parentKey: parent,
    });
    expect(result.isError, result.text).toBeFalsy();
    const [created] = JSON.parse(result.text).created;
    expect(await childKeys(parent)).toContain(created.key);
  });

  test('an undeclared key in a nested operation is refused', async () => {
    const result = await callTool('update_folder_resource', {
      resource: 'test/templates/page',
      query: {
        key: 'displayName',
        operation: {
          name: 'change',
          target: '',
          to: 'Renamed',
          stateMapping: {},
        },
      },
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('stateMapping');
  });

  test('an undeclared key in a union-typed input is refused', async () => {
    const result = await callTool('update_file_resource', {
      resource: 'test/workflows/missing',
      key: 'displayName',
      operation: { name: 'change', target: '', to: 'Renamed' },
      extra: true,
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Invalid arguments');
  });
});
