import { expect, test, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  app = createApp(tempTestDataPath);
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

test('POST /api/calculations creates a calculation successfully', async () => {
  const response = await app.request('/api/calculations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: 'test-calculation',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Calculation created successfully');
});

test('PUT /api/calculations/:prefix/:type/:identifier updates calculation content', async () => {
  const body = {
    content: '% updated by test',
  };
  const response = await app.request(
    '/api/calculations/decision/calculations/test',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Calculation updated successfully');

  // Verify file contents changed on disk
  const filePath = path.join(
    tempTestDataPath,
    '.cards',
    'local',
    'calculations',
    'test.lp',
  );
  const updated = await readFile(filePath, { encoding: 'utf-8' });
  expect(updated).toBe(body.content);
});
