// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clingoLogicBackend,
  LogicError,
  type LogicBackendFactory,
} from '@cyberismo/data-handler';

import { createServer, type Server } from '../src/index.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

// Clingo, recording the projects it serves; its queries fail as unavailable
// while `down` is set.
const labels: string[] = [];
let down = false;
const logic: LogicBackendFactory = (owner) => {
  labels.push(owner.label);
  const inner = clingoLogicBackend(owner);
  return {
    begin: () => inner.begin(),
    query: async (text) => {
      if (down) throw new LogicError('unavailable', 'Lost the programs');
      return inner.query(text);
    },
    check: (programs, options) => inner.check(programs, options),
    exportText: () => inner.exportText(),
    close: () => inner.close(),
  };
};

describe('createServer', () => {
  let projectPath: string;
  let server: Server;
  const get = (path: string) => fetch(`http://127.0.0.1:${server.port}${path}`);

  beforeAll(async () => {
    vi.stubEnv('CYBERISMO_E2E_OSPORT', 'true');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    projectPath = await createTempTestData('decision-records');
    server = await createServer(
      { projectPath },
      { auth: new MockAuthProvider(), logic },
    );
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await cleanupTempTestData(projectPath);
  });

  it('rest/server: Project opened with the given logic backend', async () => {
    expect(labels).toEqual(['decision']);
    expect((await get('/api/projects/decision/tree')).status).toBe(200);
  });

  it('rest/server: Live without credentials', async () => {
    const response = await get('/livez');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('rest/conventions: Card tree while the logic backend is unavailable', async () => {
    down = true;
    try {
      const response = await get('/api/projects/decision/tree');

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
