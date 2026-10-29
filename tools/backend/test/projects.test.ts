// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test, describe, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { localFolder, type ProjectDirectory } from '@cyberismo/data-handler';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

type ProjectsResponse = {
  projects: { prefix: string; name: string }[];
  canCreateProjects: boolean;
};

describe('GET /api/projects', () => {
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

  test('returns a list of projects with canCreateProjects false (single-project mode)', async () => {
    const response = await app.request('/api/projects');

    expect(response.status).toBe(200);

    const result = (await response.json()) as ProjectsResponse;
    expect(result.projects).toBeInstanceOf(Array);
    expect(result.projects.length).toBe(1);
    expect(result.projects[0]).toHaveProperty('prefix', 'decision');
    expect(result.projects[0]).toHaveProperty('name');
    expect(result.canCreateProjects).toBe(false);
  });

  test('returns canCreateProjects true when multiProjectRoot is set', async () => {
    const ws = await openTestWorkspace(tempTestDataPath);
    const appWithRoot = createApp(
      new MockAuthProvider(),
      directoryOf(ws),
      undefined,
      undefined,
      tempTestDataPath,
    );

    const response = await appWithRoot.request('/api/projects');
    const result = (await response.json()) as ProjectsResponse;

    expect(result.canCreateProjects).toBe(true);
  });

  test('returns empty array when no projects', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'cyberismo-test-'));
    const { directory } = await localFolder(empty);
    const emptyApp = createApp(new MockAuthProvider(), directory);

    const response = await emptyApp.request('/api/projects');

    expect(response.status).toBe(200);

    const result = (await response.json()) as ProjectsResponse;
    expect(result.projects).toBeInstanceOf(Array);
    expect(result.projects.length).toBe(0);
    expect(result.canCreateProjects).toBe(false);
    await rm(empty, { recursive: true, force: true });
  });
});

describe('POST /api/projects', () => {
  let tempDir: string;
  let registry: ProjectDirectory;

  beforeEach(async () => {
    tempDir = await createTempTestData('decision-records');
    // The project's folder, which multiRoot names below.
    ({ directory: registry } = await localFolder(dirname(tempDir)));
  });

  afterEach(async () => {
    await cleanupTempTestData(tempDir);
  });

  test('returns 403 in single-project mode', async () => {
    const app = createApp(new MockAuthProvider(), registry);

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test', prefix: 'test' }),
    });

    expect(response.status).toBe(403);
    const result = (await response.json()) as { error: string; code: string };
    expect(result.error).toContain('single-project mode');
    expect(result.code).toBe('permission-denied');
  });

  test('returns 409 for duplicate prefix', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      undefined,
      multiRoot,
    );

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Decision', prefix: 'decision' }),
    });

    expect(response.status).toBe(409);
    const result = (await response.json()) as { error: string; code: string };
    expect(result.error).toContain('already exists');
    expect(result.code).toBe('conflict');
  });

  test('creates a new project successfully', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      undefined,
      multiRoot,
    );

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Project',
        prefix: 'newproj',
        category: 'Test',
        description: 'A test project',
      }),
    });

    expect(response.status).toBe(201);
    const result = (await response.json()) as {
      prefix: string;
      name: string;
      category?: string;
    };
    expect(result.prefix).toBe('newproj');
    expect(result.name).toBe('New Project');
    expect(result.category).toBe('Test');
    expect((await registry.list()).map((p) => p.prefix)).toContain('newproj');

    // Cleanup created project
    await rm(join(multiRoot, 'newproj'), { recursive: true, force: true });
  });

  test('validates required fields', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      undefined,
      multiRoot,
    );

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Missing Prefix' }),
    });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/projects/clone', () => {
  let tempDir: string;
  let registry: ProjectDirectory;

  beforeEach(async () => {
    tempDir = await createTempTestData('decision-records');
    // The project's folder, which multiRoot names below.
    ({ directory: registry } = await localFolder(dirname(tempDir)));
  });

  afterEach(async () => {
    await cleanupTempTestData(tempDir);
  });

  test('returns 403 in single-project mode', async () => {
    const app = createApp(new MockAuthProvider(), registry);

    const response = await app.request('/api/projects/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://github.com/example/repo.git' }),
    });

    expect(response.status).toBe(403);
    const result = (await response.json()) as { error: string; code: string };
    expect(result.error).toContain('single-project mode');
    expect(result.code).toBe('permission-denied');
  });

  test('validates url is required', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      undefined,
      multiRoot,
    );

    const response = await app.request('/api/projects/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
  });
});
