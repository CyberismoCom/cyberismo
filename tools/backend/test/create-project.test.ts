// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// POST /api/projects end to end: response, created files and commits,
// offline, outside any repository.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { localFolder } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import {
  isolatedGitEnv,
  OFFLINE_EGRESS_PROXY,
  projectSnapshot,
} from '../../data-handler/test/helpers/project-snapshot.js';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cyberismo-create-project-'));
  for (const [name, value] of Object.entries(await isolatedGitEnv(root))) {
    vi.stubEnv(name, value);
  }
  // Read at this file's first fetch and kept; every test sets the same one.
  vi.stubEnv('CYBERISMO_EGRESS_PROXY', OFFLINE_EGRESS_PROXY);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe('POST /api/projects', { timeout: 30_000 }, () => {
  test.each([
    ['without autocommit', false],
    ['with autocommit', true],
  ])('%s', async (_, autocommit) => {
    const { directory } = await localFolder(root, { autocommit });
    const app = createApp(
      new MockAuthProvider({ name: 'Bea', email: 'bea@example.com' }),
      directory,
      undefined,
      undefined,
      root,
    );

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Golden Project',
        prefix: 'gold',
        category: 'Testing',
        description: 'A golden project',
      }),
    });

    expect({
      status: response.status,
      body: await response.json(),
      listed: await directory.list(),
      ...(await projectSnapshot(join(root, 'gold'))),
    }).toMatchSnapshot();
  });
});
