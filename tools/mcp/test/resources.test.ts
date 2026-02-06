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
import {
  registerResources,
  registerResourceTemplates,
} from '../src/resources/index.js';
import { testDataPath } from './test-utils.js';

let commands: CommandManager;
let server: McpServer;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  commands = await CommandManager.getInstance(testDataPath);
  server = new McpServer({ name: 'test', version: '1.0.0' });
  registerResources(server, commands);
  registerResourceTemplates(server, commands);
});

afterAll(async () => {
  commands.project.dispose();
});

describe('MCP Resources', () => {
  test('registerResources does not throw', () => {
    const testServer = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerResources(testServer, commands)).not.toThrow();
  });

  test('registerResourceTemplates does not throw', () => {
    const testServer = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerResourceTemplates(testServer, commands)).not.toThrow();
  });

  test('project resource can be fetched', async () => {
    const project = await commands.showCmd.showProject();
    expect(project).toBeDefined();
    expect(project.name).toBe('decision');
  });

  test('card tree can be fetched', async () => {
    const tree = await commands.showCmd.showProjectCards('tree');
    expect(tree).toBeDefined();
    expect(Array.isArray(tree)).toBe(true);
  });

  test('card types can be fetched', async () => {
    const cardTypes = await commands.showCmd.showCardTypesWithDetails();
    expect(cardTypes).toBeDefined();
    expect(Array.isArray(cardTypes)).toBe(true);
    expect(cardTypes.length).toBeGreaterThan(0);
  });

  test('workflows can be fetched', () => {
    const workflows = commands.showCmd.showWorkflowsWithDetails();
    expect(workflows).toBeDefined();
    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows.length).toBeGreaterThan(0);
  });

  test('templates can be fetched', async () => {
    const templates = await commands.showCmd.showTemplatesWithDetails();
    expect(templates).toBeDefined();
    expect(Array.isArray(templates)).toBe(true);
  });

  test('field types can be fetched', async () => {
    const fieldTypes = await commands.showCmd.showResources('fieldTypes');
    expect(fieldTypes).toBeDefined();
    expect(Array.isArray(fieldTypes)).toBe(true);
  });

  test('link types can be fetched', async () => {
    const linkTypes = await commands.showCmd.showResources('linkTypes');
    expect(linkTypes).toBeDefined();
    expect(Array.isArray(linkTypes)).toBe(true);
  });
});
