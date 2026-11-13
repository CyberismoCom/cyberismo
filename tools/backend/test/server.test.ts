// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  clingoLogicBackend,
  type LogicBackendFactory,
} from '@cyberismo/data-handler';

import { createServer, type Server } from '../src/index.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

// Clingo, recording the projects it serves.
const labels: string[] = [];
const logic: LogicBackendFactory = (owner) => {
  labels.push(owner.label);
  return clingoLogicBackend(owner);
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

  it('opens the projects with the logic backend it is given', async () => {
    expect(labels).toEqual(['decision']);
    expect((await get('/api/projects/decision/tree')).status).toBe(200);
  });
});
