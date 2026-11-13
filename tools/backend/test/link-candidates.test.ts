// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test, beforeAll } from 'vitest';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  const ws = await openTestWorkspace(
    path.resolve(
      import.meta.dirname,
      '../../data-handler/test/test-data/valid/decision-records',
    ),
  );
  app = createApp(new MockAuthProvider(), directoryOf(ws));
});

const post = (query: string, role?: string) =>
  app.request('/api/projects/decision/linkCandidates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(role ? { cookie: `${MOCK_ROLE_COOKIE}=${role}` } : {}),
    },
    body: JSON.stringify({ query }),
  });

const cardQuery = `result(X) :- projectCard(X).
select(1, "results", "title").
select(1, "results", "cardType").`;

test('POST /linkCandidates responds with candidates', async () => {
  const response = await post(cardQuery);
  expect(response.status).toBe(200);
  const { candidates } = await response.json();
  expect(candidates.length).toBeGreaterThan(0);
});

test('POST /linkCandidates is closed to readers', async () => {
  expect((await post(cardQuery, 'reader')).status).toBe(403);
});
