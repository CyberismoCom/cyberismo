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

import { beforeAll, describe, expect, test } from 'vitest';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { UserRole, type UserInfo } from '../src/types.js';
import type { AuthProvider } from '../src/auth/types.js';
import { buildProject } from '../../data-handler/test/helpers/project-builder.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  // Fixes weird issue with asciidoctor
  process.argv = [];
  const ws = await openTestWorkspace(
    path.resolve(
      dirname,
      '../../data-handler/test/test-data/valid/decision-records',
    ),
  );
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCheckout(ws.checkout),
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

  test('a tool call on a session is committed as the request user', async () => {
    const project = await buildProject({
      git: true,
      cards: [{ title: 'Alpha' }],
    });
    const ws = await openTestWorkspace(project.path, { autocommit: true });
    try {
      // The same user, renamed after initializing the session: commits must
      // follow each request's user, not the one the session started with.
      let user: UserInfo = {
        id: 'dana-1',
        email: 'dana@example.com',
        name: 'Dana Editor',
        role: UserRole.Editor,
      };
      const sessionApp = createApp(
        { authenticate: async () => user },
        ProjectRegistry.fromCheckout(ws.checkout),
      );
      const post = (body: object, sessionId?: string) =>
        sessionApp.request('/mcp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...(sessionId && { 'mcp-session-id': sessionId }),
          },
          body: JSON.stringify(body),
        });
      // The JSON-RPC message in an SSE response.
      const message = async (response: Response) =>
        JSON.parse(
          (await response.text())
            .split('\n')
            .find((line) => line.startsWith('data: '))!
            .slice('data: '.length),
        );

      const init = await post({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });
      const sessionId = init.headers.get('mcp-session-id')!;
      await post(
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        sessionId,
      );

      user = { ...user, name: 'Dana Renamed', email: 'dana@new.example.com' };
      const call = await message(
        await post(
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'edit_card_metadata',
              arguments: {
                projectPrefix: 'test',
                cardKey: project.keys[0],
                field: 'title',
                value: 'Renamed',
              },
            },
          },
          sessionId,
        ),
      );
      expect(call.result.isError).toBeFalsy();

      const { stdout } = await promisify(execFile)(
        'git',
        ['log', '-1', '--format=%an <%ae>'],
        { cwd: project.path },
      );
      expect(stdout.trim()).toBe('Dana Renamed <dana@new.example.com>');
    } finally {
      ws.checkout.dispose();
      await project.cleanup();
    }
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

    const ws = await openTestWorkspace(
      path.resolve(
        dirname,
        '../../data-handler/test/test-data/valid/decision-records',
      ),
    );
    const readerApp = createApp(
      readerProvider,
      ProjectRegistry.fromCheckout(ws.checkout),
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
