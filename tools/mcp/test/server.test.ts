// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeAll, describe, expect, test } from 'vitest';
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
