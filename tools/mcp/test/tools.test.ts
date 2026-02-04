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
import { CommandManager } from '@cyberismo/data-handler';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../src/tools/index.js';
import { testDataPath } from './test-utils.js';

let commands: CommandManager;
let server: McpServer;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  commands = await CommandManager.getInstance(testDataPath);
  server = new McpServer({ name: 'test', version: '1.0.0' });
  registerTools(server, commands);
});

afterAll(async () => {
  commands.project.dispose();
});

describe('MCP Tools', () => {
  test('registerTools does not throw', () => {
    const testServer = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerTools(testServer, commands)).not.toThrow();
  });

  test('card details can be shown', () => {
    const card = commands.showCmd.showCardDetails('decision_5');
    expect(card).toBeDefined();
    expect(card?.key).toBe('decision_5');
  });

  test('card details throws for invalid key', () => {
    expect(() => commands.showCmd.showCardDetails('invalid_key')).toThrow();
  });

  test('templates list can be fetched for create_card', async () => {
    const templates = await commands.showCmd.showTemplatesWithDetails();
    expect(templates).toBeDefined();
    expect(Array.isArray(templates)).toBe(true);
  });

  test('card has metadata with state', () => {
    const card = commands.showCmd.showCardDetails('decision_5');
    expect(card).toBeDefined();
    // The card should have metadata with state information
    expect(card?.metadata).toBeDefined();
  });
});
