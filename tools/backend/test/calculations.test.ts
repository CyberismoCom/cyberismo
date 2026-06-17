import { expect, test, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider, MOCK_ROLE_COOKIE } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

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

test('POST /api/calculations creates a calculation successfully', async () => {
  const response = await app.request('/api/projects/decision/calculations', {
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

test('POST /api/calculations allows Connector role', async () => {
  const response = await app.request('/api/projects/decision/calculations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${MOCK_ROLE_COOKIE}=connector`,
    },
    body: JSON.stringify({ identifier: 'connector-calculation' }),
  });

  expect(response.status).toBe(200);
});

test('POST /api/calculations blocks Editor role', async () => {
  const response = await app.request('/api/projects/decision/calculations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${MOCK_ROLE_COOKIE}=editor`,
    },
    body: JSON.stringify({ identifier: 'editor-calculation' }),
  });

  expect(response.status).toBe(403);
});

test('POST /api/calculations blocks Reader role', async () => {
  const response = await app.request('/api/projects/decision/calculations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `${MOCK_ROLE_COOKIE}=reader`,
    },
    body: JSON.stringify({ identifier: 'reader-calculation' }),
  });

  expect(response.status).toBe(403);
});
