import { expect, test, describe, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

type ProjectsResponse = {
  projects: { prefix: string; name: string }[];
  canCreateProjects: boolean;
};

describe('GET /api/projects', () => {
  let app: ReturnType<typeof createApp>;
  let tempTestDataPath: string;

  beforeEach(async () => {
    tempTestDataPath = await createTempTestData('decision-records');
    const commands = await CommandManager.getInstance(tempTestDataPath);
    app = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
    );
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
    const commands = await CommandManager.getInstance(tempTestDataPath);
    const appWithRoot = createApp(
      new MockAuthProvider(),
      ProjectRegistry.fromCommandManager(commands),
      undefined,
      false,
      tempTestDataPath,
    );

    const response = await appWithRoot.request('/api/projects');
    const result = (await response.json()) as ProjectsResponse;

    expect(result.canCreateProjects).toBe(true);
  });

  test('returns empty array when no projects', async () => {
    const emptyApp = createApp(new MockAuthProvider(), new ProjectRegistry());

    const response = await emptyApp.request('/api/projects');

    expect(response.status).toBe(200);

    const result = (await response.json()) as ProjectsResponse;
    expect(result.projects).toBeInstanceOf(Array);
    expect(result.projects.length).toBe(0);
    expect(result.canCreateProjects).toBe(false);
  });
});

describe('POST /api/projects', () => {
  let tempDir: string;
  let registry: ProjectRegistry;

  beforeEach(async () => {
    tempDir = await createTempTestData('decision-records');
    const commands = await CommandManager.getInstance(tempDir);
    registry = ProjectRegistry.fromCommandManager(commands);
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
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain('single-project mode');
  });

  test('returns 409 for duplicate prefix', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      false,
      multiRoot,
    );

    const response = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Decision', prefix: 'decision' }),
    });

    expect(response.status).toBe(409);
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain('already exists');
  });

  test('creates a new project successfully', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      false,
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
    expect(registry.has('newproj')).toBe(true);

    // Cleanup created project
    await rm(join(multiRoot, 'newproj'), { recursive: true, force: true });
  });

  test('validates required fields', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      false,
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
  let registry: ProjectRegistry;

  beforeEach(async () => {
    tempDir = await createTempTestData('decision-records');
    const commands = await CommandManager.getInstance(tempDir);
    registry = ProjectRegistry.fromCommandManager(commands);
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
    const result = (await response.json()) as { error: string };
    expect(result.error).toContain('single-project mode');
  });

  test('validates url is required', async () => {
    const multiRoot = join(tempDir, '..');
    const app = createApp(
      new MockAuthProvider(),
      registry,
      undefined,
      false,
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
