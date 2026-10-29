// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, test } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ProjectNotFoundError,
  type CommitIdentity,
  type ProjectDirectory,
  type Workspace,
} from '@cyberismo/data-handler';
import type { ActorRef } from '@cyberismo/model';
import { resolveWorkspace } from '../src/lib/resolve-project.js';
import { TEST_USER } from './test-utils.js';

// Minimal handles; resolution only returns the one the directory opens.
const pathOf = (prefix: string) => `/tmp/${prefix}`;

function makeDirectory(projects: { prefix: string; name: string }[]) {
  return {
    open: async (
      prefix: string,
      actor: ActorRef,
      identity?: CommitIdentity,
    ) => {
      if (!projects.some((p) => p.prefix === prefix)) {
        throw new ProjectNotFoundError(prefix);
      }
      return { path: pathOf(prefix), actor, identity } as unknown as Workspace;
    },
    list: async () => projects,
  } as unknown as ProjectDirectory;
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

describe('resolveWorkspace', () => {
  test('returns a handle over the project for a valid prefix', async () => {
    const directory = makeDirectory([{ prefix: 'abc', name: 'Project ABC' }]);
    const result = await resolveWorkspace(directory, 'abc', auth, server());
    expect(result.path).toBe(pathOf('abc'));
  });

  test('acts as the authenticated user, with the client as agent', async () => {
    const directory = makeDirectory([{ prefix: 'abc', name: 'Project ABC' }]);
    const result = await resolveWorkspace(
      directory,
      'abc',
      auth,
      server('claude'),
    );
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

  test('refuses a request without an authenticated user', async () => {
    const directory = makeDirectory([{ prefix: 'abc', name: 'Project ABC' }]);
    await expect(
      resolveWorkspace(directory, 'abc', {}, server()),
    ).rejects.toThrow('MCP request has no authenticated user');
  });

  test('throws for unknown prefix with available projects listed', async () => {
    const directory = makeDirectory([
      { prefix: 'abc', name: 'Project ABC' },
      { prefix: 'xyz', name: 'Project XYZ' },
    ]);
    await expect(
      resolveWorkspace(directory, 'nope', auth, server()),
    ).rejects.toThrow(/Unknown project 'nope'/);
    await expect(
      resolveWorkspace(directory, 'nope', auth, server()),
    ).rejects.toThrow(/abc, xyz/);
  });

  test('throws for unknown prefix when no projects available', async () => {
    const directory = makeDirectory([]);
    await expect(
      resolveWorkspace(directory, 'anything', auth, server()),
    ).rejects.toThrow(/No projects available/);
  });

  test('resolves correct project among multiple', async () => {
    const directory = makeDirectory([
      { prefix: 'alpha', name: 'Alpha' },
      { prefix: 'beta', name: 'Beta' },
    ]);
    const result = await resolveWorkspace(directory, 'beta', auth, server());
    expect(result.path).toBe(pathOf('beta'));
  });
});
