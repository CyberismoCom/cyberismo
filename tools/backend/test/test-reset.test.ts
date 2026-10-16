// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { cp, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import {
  localFolder,
  type ProjectDirectory,
  type Workspace,
} from '@cyberismo/data-handler';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

describe('POST /api/test/reset', () => {
  let projectPath: string;
  let goldenPath: string;
  let app: ReturnType<typeof createApp>;
  let registry: ProjectDirectory;
  let ws: Workspace;

  beforeAll(async () => {
    process.argv = []; // Fixes weird issue with asciidoctor (per api.test.ts)
    process.env.NODE_ENV = 'test';
    projectPath = await createTempTestData('decision-records');
    goldenPath = `${projectPath}.golden`;
    await cp(projectPath, goldenPath, { recursive: true });

    process.env.npm_config_project_path = projectPath;
    process.env.CYBERISMO_GOLDEN_PATH = goldenPath;

    ws = await openTestWorkspace(projectPath);
    registry = directoryOf(ws);
    app = createApp(new MockAuthProvider(), registry);
  }, 60_000);

  afterAll(async () => {
    await cleanupTempTestData(projectPath);
    await rm(goldenPath, { recursive: true, force: true });
    delete process.env.npm_config_project_path;
    delete process.env.CYBERISMO_GOLDEN_PATH;
  }, 60_000);

  it('restores the project from the golden snapshot', async () => {
    const marker = join(projectPath, 'MUTATION_MARKER.txt');
    await writeFile(marker, 'mutated');

    const res = await app.request('/api/test/reset', { method: 'POST' });
    expect(res.status).toBe(204);

    await expect(readFile(marker, 'utf8')).rejects.toThrow();
  });

  it('reopens the project: the old handle is refused, the prefix still resolves', async () => {
    await expect(
      ws.modules.install(`file:${goldenPath}`),
    ).rejects.toMatchObject({ code: 'workspace-disposed' });
    const res = await app.request('/api/projects/decision/cards');
    expect(res.status).toBe(200);
  });

  it('fails when the directory has no projects', async () => {
    const prev = process.env.npm_config_project_path;
    const prevGolden = process.env.CYBERISMO_GOLDEN_PATH;
    const empty = await mkdtemp(join(tmpdir(), 'cyberismo-reset-'));
    process.env.npm_config_project_path = empty;
    process.env.CYBERISMO_GOLDEN_PATH = await mkdtemp(
      join(tmpdir(), 'cyberismo-golden-'),
    );
    try {
      const { directory } = await localFolder(empty);
      const res = await createApp(new MockAuthProvider(), directory).request(
        '/api/test/reset',
        { method: 'POST' },
      );
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: `reset scan found no projects at ${empty}`,
      });
    } finally {
      await rm(empty, { recursive: true, force: true });
      await rm(process.env.CYBERISMO_GOLDEN_PATH, {
        recursive: true,
        force: true,
      });
      process.env.npm_config_project_path = prev;
      process.env.CYBERISMO_GOLDEN_PATH = prevGolden;
    }
  });

  it('returns 404 when NODE_ENV is not test', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const prodApp = createApp(new MockAuthProvider(), registry);
    const res = await prodApp.request('/api/test/reset', { method: 'POST' });
    expect(res.status).toBe(404);
    process.env.NODE_ENV = prev;
  });

  it('refuses to reset when projectPath is "/" (defense in depth)', async () => {
    const prev = process.env.npm_config_project_path;
    process.env.npm_config_project_path = '/';
    const res = await app.request('/api/test/reset', { method: 'POST' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/suspicious project path/i);
    process.env.npm_config_project_path = prev;
  });
});
