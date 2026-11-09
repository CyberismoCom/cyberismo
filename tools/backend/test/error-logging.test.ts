// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  ProjectNotFoundError,
  type ProjectDirectory,
} from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';

// A directory that knows no projects and fails on 'broken'.
const directory = {
  open: async (prefix: string) => {
    if (prefix === 'broken') throw new Error('disk on fire');
    throw new ProjectNotFoundError(prefix);
  },
} as unknown as ProjectDirectory;

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// Whether onError logged the stack of the error with this message.
const loggedStack = (message: string) =>
  consoleError.mock.calls.some((call) => String(call[0]).includes(message));

test.each([
  [
    'does not log',
    'an unknown project',
    'demo',
    404,
    "Project 'demo' not found",
    false,
  ],
  ['logs', 'a server fault', 'broken', 500, 'disk on fire', true],
])('%s the stack of %s', async (_, __, prefix, status, message, logged) => {
  const app = createApp(new MockAuthProvider(), directory);

  const res = await app.request(`/api/projects/${prefix}/cards`);

  expect(res.status).toBe(status);
  expect(loggedStack(message)).toBe(logged);
});
