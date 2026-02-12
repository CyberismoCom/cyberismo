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

describe('MCP Tools via Client', () => {
  test('list_tools returns all registered tools', async () => {
    const result = await client.listTools();
    const toolNames = result.tools.map((t) => t.name);

    // Original 14 tools
    expect(toolNames).toContain('create_card');
    expect(toolNames).toContain('edit_card_content');
    expect(toolNames).toContain('edit_card_metadata');
    expect(toolNames).toContain('transition_card');
    expect(toolNames).toContain('move_card');
    expect(toolNames).toContain('create_link');
    expect(toolNames).toContain('remove_link');
    expect(toolNames).toContain('create_attachment');
    expect(toolNames).toContain('remove_card');
    expect(toolNames).toContain('create_label');
    expect(toolNames).toContain('remove_label');
    expect(toolNames).toContain('get_card');
    expect(toolNames).toContain('list_cards');
    expect(toolNames).toContain('list_templates');

    // Phase 1: Quick Wins
    expect(toolNames).toContain('remove_attachment');
    expect(toolNames).toContain('list_labels');
    expect(toolNames).toContain('rank_card_first');
    expect(toolNames).toContain('rank_card_after');
    expect(toolNames).toContain('rank_card_by_index');

    // Phase 2: Resource Creation
    expect(toolNames).toContain('create_card_type');
    expect(toolNames).toContain('create_field_type');
    expect(toolNames).toContain('create_workflow');
    expect(toolNames).toContain('create_link_type');
    expect(toolNames).toContain('create_template');
    expect(toolNames).toContain('add_template_cards');

    // Phase 3: Resource Management
    expect(toolNames).toContain('delete_resource');
    expect(toolNames).toContain('validate_resource');
    expect(toolNames).toContain('update_resource');

    // Phase 4: Calculations & Queries
    expect(toolNames).toContain('create_calculation');
    expect(toolNames).toContain('run_query');
    expect(toolNames).toContain('run_logic_program');
    expect(toolNames).toContain('create_report');
    expect(toolNames).toContain('run_report');
    expect(toolNames).toContain('run_graph');

    expect(toolNames).toHaveLength(34);
  });

  test('get_card returns rendered card data', async () => {
    const result = await client.callTool({
      name: 'get_card',
      arguments: { cardKey: 'decision_5' },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);

    const content = result.content[0];
    expect(content).toHaveProperty('type', 'text');
    const parsed = JSON.parse((content as { text: string }).text);

    expect(parsed.key).toBe('decision_5');
    expect(parsed.title).toBeDefined();
    expect(parsed.cardType).toBeDefined();
    expect(parsed.workflowState).toBeDefined();
    expect(parsed.rawContent).toBeDefined();
    expect(parsed.parsedContent).toBeDefined();
    expect(Array.isArray(parsed.fields)).toBe(true);
    expect(Array.isArray(parsed.availableTransitions)).toBe(true);
    expect(Array.isArray(parsed.labels)).toBe(true);
    expect(Array.isArray(parsed.links)).toBe(true);
    expect(parsed.deniedOperations).toBeDefined();
  });

  test('get_card with raw mode returns basic data', async () => {
    const result = await client.callTool({
      name: 'get_card',
      arguments: { cardKey: 'decision_5', raw: true },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.key).toBe('decision_5');
  });

  test('get_card returns error for invalid key', async () => {
    const result = await client.callTool({
      name: 'get_card',
      arguments: { cardKey: 'nonexistent_key_999' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('Error getting card');
  });

  test('list_cards returns card tree', async () => {
    const result = await client.callTool({
      name: 'list_cards',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  test('list_templates returns templates', async () => {
    const result = await client.callTool({
      name: 'list_templates',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(Array.isArray(parsed)).toBe(true);
  });

  test('list_labels returns labels array', async () => {
    const result = await client.callTool({
      name: 'list_labels',
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.success).toBe(true);
    expect(Array.isArray(parsed.labels)).toBe(true);
  });

  test('run_query with tree returns results', async () => {
    const result = await client.callTool({
      name: 'run_query',
      arguments: { queryName: 'tree' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });
});
