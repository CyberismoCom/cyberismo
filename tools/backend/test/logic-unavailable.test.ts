// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clingoLogicBackend,
  localFolder,
  LogicError,
  type LogicBackendFactory,
} from '@cyberismo/data-handler';

import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

// Clingo, whose queries fail as unavailable while `down` is set.
let down = false;
const logic: LogicBackendFactory = (owner) => {
  const inner = clingoLogicBackend(owner);
  return {
    begin: () => inner.begin(),
    query: async (text) => {
      if (down) throw new LogicError('unavailable', 'Lost the programs');
      return inner.query(text);
    },
    check: (programs) => inner.check(programs),
    exportText: () => inner.exportText(),
    close: () => inner.close(),
  };
};

describe('a logic failure thrown in a route', () => {
  let projectPath: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    projectPath = await createTempTestData('decision-records');
    const { directory } = await localFolder(projectPath, { logic });
    app = createApp(new MockAuthProvider(), directory);
  });

  afterAll(async () => {
    await cleanupTempTestData(projectPath);
  });

  it('reaches the central error handler and is served by its kind', async () => {
    expect((await app.request('/api/projects/decision/tree')).status).toBe(200);
    down = true;
    try {
      const response = await app.request('/api/projects/decision/tree');

      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('5');
      expect(await response.json()).toMatchObject({
        code: 'logic',
        details: { kind: 'unavailable' },
      });
    } finally {
      down = false;
    }
  });
});
