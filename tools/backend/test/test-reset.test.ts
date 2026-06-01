import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { cp, rm, writeFile, readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

describe('POST /api/test/reset', () => {
  let projectPath: string;
  let goldenPath: string;
  let app: ReturnType<typeof createApp>;
  let registry: ProjectRegistry;

  beforeAll(async () => {
    process.argv = []; // Fixes weird issue with asciidoctor (per api.test.ts)
    process.env.NODE_ENV = 'test';
    projectPath = await createTempTestData('decision-records');
    goldenPath = `${projectPath}.golden`;
    await cp(projectPath, goldenPath, { recursive: true });

    process.env.npm_config_project_path = projectPath;
    process.env.CYBERISMO_GOLDEN_PATH = goldenPath;

    const commands = await CommandManager.getInstance(projectPath);
    registry = ProjectRegistry.fromCommandManager(commands);
    app = createApp(new MockAuthProvider(), registry);
  }, 60_000);

  afterAll(async () => {
    registry.dispose();
    await cleanupTempTestData(projectPath);
    await rm(goldenPath, { recursive: true, force: true });
    delete process.env.npm_config_project_path;
    delete process.env.CYBERISMO_GOLDEN_PATH;
  }, 60_000);

  it('restores the project from the golden snapshot', async () => {
    const marker = join(projectPath, 'MUTATION_MARKER.txt');
    await writeFile(marker, 'mutated');
    await access(marker); // sanity: marker exists

    const res = await app.request('/api/test/reset', { method: 'POST' });
    expect(res.status).toBe(204);

    await expect(readFile(marker, 'utf8')).rejects.toThrow();
  });

  it('keeps the registry usable after reset (project prefix still resolves)', async () => {
    // decision-records uses prefix 'decision' per its existing usage in api.test.ts
    expect(registry.get('decision')).toBeDefined();
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
