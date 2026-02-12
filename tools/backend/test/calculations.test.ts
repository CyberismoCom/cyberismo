import { expect, test, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  app = createApp(new MockAuthProvider(), tempTestDataPath);
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
      identifier: 'test-calculation',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Calculation created successfully');
});
