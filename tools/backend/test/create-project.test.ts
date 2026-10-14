/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

// POST /api/projects end to end: response, created files and commits,
// offline, outside any repository.

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { localFolder } from '@cyberismo/data-handler';
import { resetEgressDispatcherForTest } from '@cyberismo/data-handler/utils/egress';
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
  vi.stubEnv('CYBERISMO_EGRESS_PROXY', OFFLINE_EGRESS_PROXY);
  await resetEgressDispatcherForTest();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await resetEgressDispatcherForTest();
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
