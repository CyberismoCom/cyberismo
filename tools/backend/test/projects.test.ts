import { expect, test, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

type ProjectsResponse = {
  prefix: string;
  name: string;
}[];

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

test('GET /api/projects returns a list of projects', async () => {
  const response = await app.request('/api/projects');

  expect(response.status).toBe(200);

  const result = (await response.json()) as ProjectsResponse;
  expect(result).toBeInstanceOf(Array);
  expect(result.length).toBe(1);
  expect(result[0]).toHaveProperty('prefix', 'decision');
  expect(result[0]).toHaveProperty('name');
});

test('GET /api/projects returns empty array when no projects', async () => {
  const emptyApp = createApp(new MockAuthProvider(), new ProjectRegistry());

  const response = await emptyApp.request('/api/projects');

  expect(response.status).toBe(200);

  const result = (await response.json()) as ProjectsResponse;
  expect(result).toBeInstanceOf(Array);
  expect(result.length).toBe(0);
});
