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

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { type CardsChanged, CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { UserRole } from '../src/types.js';
import type { AuthProvider } from '../src/auth/types.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  // Fixes weird issue with asciidoctor
  process.argv = [];
  const commands = await CommandManager.getInstance(
    path.resolve(
      dirname,
      '../../data-handler/test/test-data/valid/decision-records',
    ),
  );
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
});

describe('MCP HTTP Endpoint', () => {
  test('POST /mcp with initialize message returns a response', async () => {
    const initMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '1.0.0',
        },
      },
    };

    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(initMessage),
    });

    expect(response).not.toBe(null);
    // MCP returns either JSON or SSE stream
    expect([200, 202]).toContain(response.status);
  });

  test('DELETE /mcp without session returns success', async () => {
    const response = await app.request('/mcp', {
      method: 'DELETE',
    });

    expect(response).not.toBe(null);
    expect(response.status).toBe(200);

    const result = await response.json();
    expect(result.message).toBe('Session closed');
  });

  test('POST /mcp with unknown session ID returns 404', async () => {
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'mcp-session-id': 'nonexistent-session-id',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });

    expect(response.status).toBe(404);
    const result = await response.json();
    expect(result.error).toBe('Unknown session ID');
  });

  test('POST /mcp with invalid JSON returns error', async () => {
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: 'invalid json',
    });

    expect(response).not.toBe(null);
    // Should return an error status
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  test('POST /mcp returns 403 for Reader role', async () => {
    const readerProvider: AuthProvider = {
      authenticate: async () => ({
        id: 'reader-user',
        email: 'reader@test.com',
        name: 'Reader User',
        role: UserRole.Reader,
      }),
    };

    const commands = await CommandManager.getInstance(
      path.resolve(
        dirname,
        '../../data-handler/test/test-data/valid/decision-records',
      ),
    );
    const readerApp = createApp(
      readerProvider,
      ProjectRegistry.fromCommandManager(commands),
    );

    const response = await readerApp.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      }),
    });

    expect(response.status).toBe(403);
    const result = await response.json();
    expect(result.error).toBe('Forbidden');
  });
});

describe('MCP write provenance', () => {
  let tempDir: string;
  let commands: CommandManager;
  let agentApp: ReturnType<typeof createApp>;

  const editor: AuthProvider = {
    authenticate: async () => ({
      id: 'dana',
      email: 'dana@example.com',
      name: 'Dana Editor',
      role: UserRole.Editor,
    }),
  };

  const mcpHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };

  beforeAll(async () => {
    tempDir = await createTempTestData('decision-records');
    commands = new CommandManager(tempDir, { autocommit: true });
    await commands.initialize();
    agentApp = createApp(editor, ProjectRegistry.fromCommandManager(commands));
  });

  afterAll(async () => {
    commands.project.dispose();
    await cleanupTempTestData(tempDir);
  });

  test('commits agent writes as the user, marked with agent trailers', async () => {
    const changes: CardsChanged[] = [];
    const unsubscribe = commands.project.onCardsChanged((change) =>
      changes.push(change),
    );
    const init = await agentApp.request('/mcp', {
      method: 'POST',
      headers: mcpHeaders,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-agent', version: '1.0.0' },
        },
      }),
    });
    const sessionId = init.headers.get('mcp-session-id')!;
    expect(sessionId).toBeTruthy();
    await init.text();

    const headers = { ...mcpHeaders, 'mcp-session-id': sessionId };
    await agentApp.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    const call = await agentApp.request('/mcp', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'create_label',
          arguments: {
            projectPrefix: 'decision',
            cardKey: 'decision_5',
            label: 'agent-label',
          },
        },
      }),
    });
    expect(await call.text()).not.toContain('isError');
    unsubscribe();
    expect(changes).toEqual([
      {
        updated: ['decision_5'],
        removed: [],
        author: { name: 'Dana Editor', email: 'dana@example.com', id: 'dana' },
        actor: { kind: 'agent', name: 'test-agent' },
      },
    ]);

    const { stdout: log } = await promisify(execFile)(
      'git',
      ['log', '-1', '--format=%an <%ae>%n%(trailers:only,unfold)'],
      { cwd: tempDir },
    );
    expect(log.trim().split('\n')).toEqual([
      'Dana Editor <dana@example.com>',
      'Cyberismo-Actor: agent',
      'Cyberismo-Agent: test-agent',
    ]);
  });
});
