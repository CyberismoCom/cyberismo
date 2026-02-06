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
import { createMcpServer } from '../src/server.js';
import { testDataPath } from './test-utils.js';

let commands: CommandManager;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  commands = await CommandManager.getInstance(testDataPath);
});

afterAll(async () => {
  commands.project.dispose();
});

describe('createMcpServer', () => {
  test('creates an MCP server instance with default options', () => {
    const server = createMcpServer(commands);
    expect(server).toBeDefined();
  });

  test('creates server with custom name and version', () => {
    const server = createMcpServer(commands, {
      name: 'test-server',
      version: '2.0.0',
    });
    expect(server).toBeDefined();
  });
});
