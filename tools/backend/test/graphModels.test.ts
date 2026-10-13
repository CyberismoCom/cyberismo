import { expect, test, beforeEach, afterEach } from 'vitest';
import { Workspace } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  const ws = await Workspace.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(ws),
  );
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

test('POST /api/graphModels creates a graph model successfully', async () => {
  const response = await app.request('/api/projects/decision/graphModels', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-graphmodel',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Graph model created successfully');
});
