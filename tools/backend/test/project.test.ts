import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

type ProjectResponse = {
  name: string;
  cardKeyPrefix: string;
  modules: {
    name: string;
    cardKeyPrefix: string;
    scope: string;
    readOnly: boolean;
  }[];
};

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('module-test');
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

describe('Project endpoints', () => {
  test('GET /api/project returns project info', async () => {
    const response = await app.request('/api/projects/test/project');
    expect(response.status).toBe(200);
    const result = (await response.json()) as ProjectResponse;

    expect(result.name).toBeTruthy();
    expect(result.cardKeyPrefix).toBeTruthy();
    expect(Array.isArray(result.modules)).toBe(true);
  });

  test('PATCH /api/project updates name and prefix', async () => {
    const response = await app.request('/api/projects/test/project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Project Name',
        cardKeyPrefix: 'projtest',
      }),
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as ProjectResponse;
    expect(result.name).toBe('Updated Project Name');
    expect(result.cardKeyPrefix).toBe('projtest');
  });

  test('GET /api/project/modules/importable returns the importable modules', async () => {
    const response = await app.request(
      '/api/projects/test/project/modules/importable',
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toHaveLength(4);
  });

  test('POST /api/project/modules returns 400 for missing source', async () => {
    const response = await app.request('/api/projects/test/project/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  test('POST /api/project/modules returns 400 for non-git source', async () => {
    const response = await app.request('/api/projects/test/project/modules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: 'not-a-git-url' }),
    });
    expect(response.status).toBe(400);
  });
});
