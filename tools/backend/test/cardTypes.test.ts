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

test('POST /api/cardTypes creates a card type successfully', async () => {
  const response = await app.request('/api/cardTypes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-cardtype',
      workflowName: 'decision/workflows/simple',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Card type created successfully');
});

test('POST /api/cardTypes returns error for non-existent workflow', async () => {
  const response = await app.request('/api/cardTypes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-cardtype-nonexistent',
      workflowName: 'nonexistent/workflow',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(500);

  const result = await response.json();
  expect(result).toHaveProperty('error');
});
