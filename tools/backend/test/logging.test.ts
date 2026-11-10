// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, expect, test } from 'vitest';
import { Writable } from 'node:stream';
import { configureLogging } from '@cyberismo/node-common/log';
import type { Workspace } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let app: ReturnType<typeof createApp>;
let path: string;
let ws: Workspace;
let lines: { level: number; module?: string; err: { stack: string } }[];

beforeEach(async () => {
  lines = [];
  path = await createTempTestData('decision-records');
  ws = await openTestWorkspace(path);
  app = createApp(new MockAuthProvider(), directoryOf(ws));
  // Warn and up, attached after setup: data-handler's trace and setup records are not under test.
  configureLogging([
    {
      level: 'warn',
      stream: new Writable({
        write(chunk, _encoding, done) {
          lines.push(
            ...String(chunk)
              .trim()
              .split('\n')
              .map((l) => JSON.parse(l)),
          );
          done();
        },
      }),
    },
  ]);
});

afterEach(async () => {
  configureLogging([]);
  await cleanupTempTestData(path);
});

test('a server fault is logged once with its stack', async () => {
  app.get('/boom', () => {
    throw new Error('boom');
  });

  const response = await app.request('/boom');

  expect(response.status).toBe(500);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ level: 50, module: 'backend' });
  expect(lines[0].err.stack).toContain('boom');
});

test('a client error is answered, not logged', async () => {
  const response = await app.request(
    '/api/projects/decision/cards/nope_0000000',
  );

  expect(response.status).toBe(404);
  expect(lines).toEqual([]);
});
