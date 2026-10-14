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
import { type Workspace } from '@cyberismo/data-handler';
import { createMcpServer } from '../src/server.js';
import { testDataPath } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let ws: Workspace;

// Fixes weird issue with asciidoctor
beforeAll(async () => {
  process.argv = [];
  ws = await openTestWorkspace(testDataPath);
});

afterAll(async () => {
  ws.checkout.dispose();
});

describe('createMcpServer', () => {
  test('creates an MCP server instance with default options', () => {
    const server = createMcpServer(directoryOf(ws));
    expect(server).toBeDefined();
  });

  test('creates server with custom name and version', () => {
    const server = createMcpServer(directoryOf(ws), {
      name: 'test-server',
      version: '2.0.0',
    });
    expect(server).toBeDefined();
  });
});
