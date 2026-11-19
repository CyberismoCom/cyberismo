// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import * as dataHandler from '@cyberismo/data-handler';
import {
  clingoLogicBackend,
  type LogicBackendFactory,
  type ProjectDirectory,
} from '@cyberismo/data-handler';

import { createServer, type Server } from '../src/index.js';
import type * as overlay from '../src/overlay.js';
import * as utils from '../src/utils.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

// The real localFolder, recording how the server opens the projects.
vi.mock('@cyberismo/data-handler', async (importOriginal) => {
  const original = await importOriginal<typeof dataHandler>();
  return { ...original, localFolder: vi.fn(original.localFolder) };
});
const localFolder = vi.mocked(dataHandler.localFolder);

// The policy polling, recording when the server stops it.
const { stopPolling } = vi.hoisted(() => ({ stopPolling: vi.fn() }));
vi.mock('../src/overlay.js', async (importOriginal) => ({
  ...(await importOriginal<typeof overlay>()),
  startPolicyPolling: () => stopPolling,
}));

// The real listen, which a test can make fail.
vi.mock('../src/utils.js', async (importOriginal) => {
  const original = await importOriginal<typeof utils>();
  return { ...original, listen: vi.fn(original.listen) };
});
const listen = vi.mocked(utils.listen);

// Clingo, recording the projects it serves.
const labels: string[] = [];
const logic: LogicBackendFactory = (owner) => {
  labels.push(owner.label);
  return clingoLogicBackend(owner);
};

// A directory without projects.
const empty: ProjectDirectory = {
  list: async () => [],
  open: async (prefix) => {
    throw new dataHandler.ProjectNotFoundError(prefix);
  },
  create: async () => {
    throw new Error('not supported');
  },
  clone: async () => {
    throw new Error('not supported');
  },
  rename: async () => {},
  replace: async () => {},
};

describe('createServer', () => {
  let projectPath: string;
  const servers: Server[] = [];
  const auth = new MockAuthProvider();

  // Starts a server that the test closes.
  const start = async (...args: Parameters<typeof createServer>) => {
    const server = await createServer(...args);
    servers.push(server);
    return server;
  };
  const get = (server: Server, path: string) =>
    fetch(`http://127.0.0.1:${server.port}${path}`);
  const canCreateProjects = async (server: Server) =>
    (
      (await (await get(server, '/api/projects')).json()) as {
        canCreateProjects: boolean;
      }
    ).canCreateProjects;

  beforeAll(async () => {
    projectPath = await createTempTestData('decision-records');
    return () => cleanupTempTestData(projectPath);
  });

  beforeEach(() => {
    vi.stubEnv('CYBERISMO_E2E_OSPORT', 'true');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    labels.length = 0;
    localFolder.mockClear();
    stopPolling.mockClear();
  });

  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('opens the projects with the logic backend and git options it is given', async () => {
    const server = await start(
      { projectPath, autocommit: false },
      { auth, logic },
    );

    expect(localFolder).toHaveBeenCalledWith(
      projectPath,
      expect.objectContaining({ autocommit: false, logic }),
    );
    expect(labels).toEqual(['decision']);
    expect(server.failed).toEqual([]);
    expect((await get(server, '/api/projects/decision/tree')).status).toBe(200);
    expect(await canCreateProjects(server)).toBe(false);
  });

  it('serves a given directory, creating projects in multi-project mode', async () => {
    const server = await start(
      { projectPath, multiProject: true },
      { auth, directory: empty },
    );

    expect(localFolder).not.toHaveBeenCalled();
    expect(server.failed).toEqual([]);
    expect(await canCreateProjects(server)).toBe(true);
  });

  it.each([
    ['a logic backend', {}, { logic }],
    ['autocommit', { autocommit: true }, {}],
    ['autopush', { autopush: true }, {}],
  ])('refuses a given directory with %s', async (_, options, parts) => {
    await expect(
      createServer(
        { projectPath, ...options },
        { auth, directory: empty, ...parts },
      ),
    ).rejects.toThrow(/apply only when the server opens the projects/);
    expect(localFolder).not.toHaveBeenCalled();
  });

  it('stops listening and polling the policy when closed', async () => {
    const server = await createServer(
      { projectPath },
      { auth, directory: empty },
    );
    expect(stopPolling).not.toHaveBeenCalled();

    await server.close();

    expect(stopPolling).toHaveBeenCalledOnce();
    await expect(get(server, '/api/projects')).rejects.toThrow();
  });

  it('stops polling the policy when it cannot listen', async () => {
    listen.mockRejectedValueOnce(new Error('Cannot listen'));

    await expect(
      createServer({ projectPath }, { auth, directory: empty }),
    ).rejects.toThrow('Cannot listen');
    expect(stopPolling).toHaveBeenCalledOnce();
  });
});
