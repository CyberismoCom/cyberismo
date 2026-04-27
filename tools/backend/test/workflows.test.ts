import { expect, test, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
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

test('POST /api/workflows creates a workflow successfully', async () => {
  const response = await app.request('/api/projects/decision/workflows', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-workflow',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Workflow created successfully');
});

test('GET /api/resources/:prefix/workflows/:identifier/graph renders the workflow graph', async () => {
  const response = await app.request(
    '/api/resources/decision/workflows/simple/graph',
  );

  expect(response.status).toBe(200);
  const result = (await response.json()) as { svg: string };
  expect(result.svg).toBeTruthy();
  const decoded = Buffer.from(result.svg, 'base64').toString('utf-8');
  expect(decoded).toContain('<svg');
  expect(decoded).toContain('Created');
  expect(decoded).toContain('Approved');
}, 20000);

test('GET /api/resources/:prefix/workflows/:identifier/graph returns 404 for unknown workflow', async () => {
  const response = await app.request(
    '/api/resources/decision/workflows/does-not-exist/graph',
  );

  expect(response.status).toBe(404);
});

test('GET /api/resources/:prefix/workflows/:identifier/graph?card=... highlights the card state', async () => {
  const plain = await app.request(
    '/api/resources/decision/workflows/simple/graph',
  );
  const highlighted = await app.request(
    '/api/resources/decision/workflows/simple/graph?card=decision_5',
  );

  expect(plain.status).toBe(200);
  expect(highlighted.status).toBe(200);
  const plainSvg = ((await plain.json()) as { svg: string }).svg;
  const highlightedSvg = ((await highlighted.json()) as { svg: string }).svg;
  expect(plainSvg).not.toBe(highlightedSvg);
}, 20000);

test('GET /api/resources/:prefix/workflows/:identifier/graph?card=... returns 404 for unknown card', async () => {
  const response = await app.request(
    '/api/resources/decision/workflows/simple/graph?card=decision_999',
  );
  expect(response.status).toBe(404);
});
