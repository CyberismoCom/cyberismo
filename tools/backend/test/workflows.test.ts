import { expect, test, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import { listWorkflowGraphParams } from '../src/domain/resources/service.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;
let commands: CommandManager;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  commands = await CommandManager.getInstance(tempTestDataPath);
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

test('GET /api/projects/:prefix/resources/:prefix/workflows/:identifier/graph renders the workflow graph', async () => {
  const response = await app.request(
    '/api/projects/decision/resources/decision/workflows/simple/graph',
  );

  expect(response.status).toBe(200);
  const result = (await response.json()) as { svg: string };
  expect(result.svg).toBeTruthy();
  const decoded = Buffer.from(result.svg, 'base64').toString('utf-8');
  expect(decoded).toContain('<svg');
  expect(decoded).toContain('Created');
  expect(decoded).toContain('Approved');
}, 20000);

test('GET /api/projects/:prefix/resources/:prefix/workflows/:identifier/graph returns 404 for unknown workflow', async () => {
  const response = await app.request(
    '/api/projects/decision/resources/decision/workflows/does-not-exist/graph',
  );

  expect(response.status).toBe(404);
});

test('GET /api/projects/:prefix/resources/:prefix/workflows/:identifier/graph?card=... highlights the card state', async () => {
  const plain = await app.request(
    '/api/projects/decision/resources/decision/workflows/simple/graph',
  );
  const highlighted = await app.request(
    '/api/projects/decision/resources/decision/workflows/simple/graph?card=decision_5',
  );

  expect(plain.status).toBe(200);
  expect(highlighted.status).toBe(200);
  const plainSvg = ((await plain.json()) as { svg: string }).svg;
  const highlightedSvg = ((await highlighted.json()) as { svg: string }).svg;
  expect(plainSvg).not.toBe(highlightedSvg);
}, 20000);

test('GET /api/projects/:prefix/resources/:prefix/workflows/:identifier/graph?card=... returns 404 for unknown card', async () => {
  const response = await app.request(
    '/api/projects/decision/resources/decision/workflows/simple/graph?card=decision_999',
  );
  expect(response.status).toBe(404);
});

// Regression test for INTDEV-1302: the static site version of the workflow
// editor showed an error in place of the workflow graph because the graph
// endpoint was not enumerated for static site generation (no ssgParams), so
// the pre-rendered JSON the static frontend requests was never produced.
// listWorkflowGraphParams supplies that enumeration; every entry it returns
// must resolve to a route that actually renders a graph.
test('listWorkflowGraphParams enumerates renderable workflow graph routes (INTDEV-1302)', async () => {
  const params = await listWorkflowGraphParams(commands);

  expect(params.length).toBeGreaterThan(0);
  expect(params).toContainEqual({ prefix: 'decision', identifier: 'simple' });

  for (const { prefix, identifier } of params) {
    const response = await app.request(
      `/api/projects/decision/resources/${prefix}/workflows/${identifier}/graph`,
    );
    expect(response.status).toBe(200);
    const result = (await response.json()) as { svg: string };
    expect(result.svg).toBeTruthy();
  }
}, 20000);
