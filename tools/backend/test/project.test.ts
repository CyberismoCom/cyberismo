import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { createApp } from '../src/app.js';
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
  app = createApp(tempTestDataPath);
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

describe('Project endpoints', () => {
  test('GET /api/project returns project info', async () => {
    const response = await app.request('/api/project');
    expect(response.status).toBe(200);
    const result = (await response.json()) as ProjectResponse;

    expect(result.name).toBeTruthy();
    expect(result.cardKeyPrefix).toBeTruthy();
    expect(Array.isArray(result.modules)).toBe(true);
  });

  test('PATCH /api/project updates name and prefix', async () => {
    const response = await app.request('/api/project', {
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
});
