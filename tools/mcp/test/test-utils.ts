// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpUser } from '../src/lib/resolve-project.js';

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

export const testDataPath = path.resolve(
  dirname,
  '../../data-handler/test/test-data/valid/decision-records',
);

/** The user the MCP tests act as. */
export const TEST_USER: McpUser = {
  id: 'mcp-tester',
  name: 'MCP Tester',
  email: 'mcp-tester@example.com',
  kind: 'user',
};

/**
 * Hands every message the server receives `user` as its auth info, as an
 * authenticating host (the backend) does for each request.
 */
export function authenticated(
  transport: InMemoryTransport,
  user: McpUser = TEST_USER,
): InMemoryTransport {
  const authInfo = {
    token: '',
    clientId: user.id,
    scopes: [],
    extra: { user },
  };
  let handler: InMemoryTransport['onmessage'];
  Object.defineProperty(transport, 'onmessage', {
    get: () => handler,
    set: (receive: InMemoryTransport['onmessage']) => {
      handler =
        receive &&
        ((message, extra) => receive(message, { ...extra, authInfo }));
    },
  });
  return transport;
}
