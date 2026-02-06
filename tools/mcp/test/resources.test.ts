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
import { CommandManager } from '@cyberismo/data-handler';
import { createMcpServer } from '../src/server.js';
import { testDataPath } from './test-utils.js';

let commands: CommandManager;
let client: Client;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  commands = await CommandManager.getInstance(testDataPath);

  const server = createMcpServer(commands);
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

describe('MCP Resources via Client', () => {
  test('listResources returns all registered resources', async () => {
    const result = await client.listResources();
    const names = result.resources.map((r) => r.name);

    expect(names).toContain('project');
    expect(names).toContain('cards');
    expect(names).toContain('card-types');
    expect(names).toContain('workflows');
    expect(names).toContain('templates');
    expect(names).toContain('link-types');
    expect(names).toContain('field-types');
    expect(names).toContain('calculations');
    expect(names).toContain('reports');
    expect(names).toContain('graph-models');
    expect(names).toContain('graph-views');
  });

  test('resources use cyberismo:// URI scheme', async () => {
    const result = await client.listResources();
    for (const resource of result.resources) {
      expect(resource.uri).toMatch(/^cyberismo:\/\/\//);
    }
  });

  test('project resource returns valid JSON', async () => {
    const result = await client.readResource({
      uri: 'cyberismo:///project',
    });

    expect(result.contents).toHaveLength(1);
    const content = result.contents[0];
    expect(content.mimeType).toBe('application/json');

    const parsed = JSON.parse((content as { text: string }).text);
    expect(parsed.name).toBe('decision');
  });

  test('card-types resource returns array', async () => {
    const result = await client.readResource({
      uri: 'cyberismo:///card-types',
    });

    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse((result.contents[0] as { text: string }).text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('workflows resource returns array', async () => {
    const result = await client.readResource({
      uri: 'cyberismo:///workflows',
    });

    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse((result.contents[0] as { text: string }).text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('templates resource returns array', async () => {
    const result = await client.readResource({
      uri: 'cyberismo:///templates',
    });

    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse((result.contents[0] as { text: string }).text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  test('field-types resource returns array', async () => {
    const result = await client.readResource({
      uri: 'cyberismo:///field-types',
    });

    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse((result.contents[0] as { text: string }).text);
    expect(Array.isArray(parsed)).toBe(true);
  });
});
