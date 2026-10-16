// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  const ws = await openTestWorkspace(tempTestDataPath);
  app = createApp(new MockAuthProvider(), directoryOf(ws));
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

test('POST /api/graphViews creates a graph view successfully', async () => {
  const response = await app.request('/api/projects/decision/graphViews', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-graphview',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Graph view created successfully');
});
