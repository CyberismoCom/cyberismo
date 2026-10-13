/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, expect, test } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Checkout } from '@cyberismo/data-handler';
import {
  resolveCommands,
  type ProjectProvider,
} from '../src/lib/resolve-project.js';
import { TEST_USER } from './test-utils.js';

// Minimal checkouts; resolution only hands them to the handle.
const mockCheckout = (prefix: string) =>
  ({ basePath: `/tmp/${prefix}` }) as unknown as Checkout;

function makeProvider(
  projects: { prefix: string; name: string }[],
): ProjectProvider {
  const map = new Map(projects.map((p) => [p.prefix, mockCheckout(p.prefix)]));
  return {
    get: (prefix: string) => map.get(prefix),
    list: () => projects,
  };
}

const server = (client?: string) =>
  ({
    server: { getClientVersion: () => (client ? { name: client } : undefined) },
  }) as unknown as McpServer;
const auth = {
  authInfo: {
    token: '',
    clientId: TEST_USER.id,
    scopes: [],
    extra: { user: TEST_USER },
  },
};

describe('resolveCommands', () => {
  test('returns a handle over the checkout for a valid prefix', () => {
    const provider = makeProvider([{ prefix: 'abc', name: 'Project ABC' }]);
    const result = resolveCommands(provider, 'abc', auth, server());
    expect(result.checkout).toBe(provider.get('abc'));
  });

  test('acts as the authenticated user, with the client as agent', () => {
    const provider = makeProvider([{ prefix: 'abc', name: 'Project ABC' }]);
    const result = resolveCommands(provider, 'abc', auth, server('claude'));
    expect(result.actor).toEqual({
      kind: 'user',
      id: TEST_USER.id,
      name: TEST_USER.name,
      agent: { name: 'claude' },
    });
    expect(result.identity).toEqual({
      name: TEST_USER.name,
      email: TEST_USER.email,
    });
  });

  test('refuses a request without an authenticated user', () => {
    const provider = makeProvider([{ prefix: 'abc', name: 'Project ABC' }]);
    expect(() => resolveCommands(provider, 'abc', {}, server())).toThrow(
      'MCP request has no authenticated user',
    );
  });

  test('throws for unknown prefix with available projects listed', () => {
    const provider = makeProvider([
      { prefix: 'abc', name: 'Project ABC' },
      { prefix: 'xyz', name: 'Project XYZ' },
    ]);
    expect(() => resolveCommands(provider, 'nope', auth, server())).toThrow(
      /Unknown project 'nope'/,
    );
    expect(() => resolveCommands(provider, 'nope', auth, server())).toThrow(
      /abc, xyz/,
    );
  });

  test('throws for unknown prefix when no projects available', () => {
    const provider = makeProvider([]);
    expect(() => resolveCommands(provider, 'anything', auth, server())).toThrow(
      /No projects available/,
    );
  });

  test('resolves correct project among multiple', () => {
    const provider = makeProvider([
      { prefix: 'alpha', name: 'Alpha' },
      { prefix: 'beta', name: 'Beta' },
    ]);
    const result = resolveCommands(provider, 'beta', auth, server());
    expect(result.checkout).toBe(provider.get('beta'));
  });
});
