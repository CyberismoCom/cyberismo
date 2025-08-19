import { expect, test, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  app = createApp(tempTestDataPath);
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

test('POST /api/reports creates a report successfully', async () => {
  const response = await app.request('/api/reports', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-report',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Report created successfully');
});
