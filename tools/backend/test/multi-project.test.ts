import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

describe('multi-project routing', () => {
  let app: ReturnType<typeof createApp>;
  let tempDecisionPath: string;
  let tempMinimalPath: string;

  beforeAll(async () => {
    process.argv = [];
    tempDecisionPath = await createTempTestData('decision-records');
    tempMinimalPath = await createTempTestData('minimal');

    const decisionCommands = await CommandManager.getInstance(tempDecisionPath);
    const minimalCommands = await CommandManager.getInstance(tempMinimalPath);

    const registry = new ProjectRegistry([
      {
        prefix: decisionCommands.project.configuration.cardKeyPrefix,
        commands: decisionCommands,
      },
      {
        prefix: minimalCommands.project.configuration.cardKeyPrefix,
        commands: minimalCommands,
      },
    ]);

    app = createApp(new MockAuthProvider(), registry);
  });

  afterAll(async () => {
    await cleanupTempTestData(tempDecisionPath);
    await cleanupTempTestData(tempMinimalPath);
  });

  test('GET /api/projects lists both projects', async () => {
    const response = await app.request('/api/projects');
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      prefix: string;
      name: string;
    }[];
    expect(result).toHaveLength(2);
    const prefixes = result.map((p) => p.prefix).sort();
    expect(prefixes).toContain('decision');
    expect(prefixes).toContain('mini');
  });

  test('GET /api/projects/:prefix/cards works for each project', async () => {
    const decisionRes = await app.request('/api/projects/decision/cards');
    expect(decisionRes.status).toBe(200);
    const decisionData = (await decisionRes.json()) as { name: string };
    expect(decisionData.name).toBe('decision');

    const miniRes = await app.request('/api/projects/mini/cards');
    expect(miniRes.status).toBe(200);
    const miniData = (await miniRes.json()) as { name: string };
    expect(miniData.name).toBe('minimal');
  });

  test('GET /api/projects/:prefix/tree returns project-specific tree', async () => {
    const decisionRes = await app.request('/api/projects/decision/tree');
    expect(decisionRes.status).toBe(200);
    const decisionTree = (await decisionRes.json()) as { key: string }[];
    expect(decisionTree.length).toBeGreaterThan(0);
    expect(decisionTree[0].key).toMatch(/^decision_/);

    const miniRes = await app.request('/api/projects/mini/tree');
    expect(miniRes.status).toBe(200);
    const miniTree = (await miniRes.json()) as { key: string }[];
    // minimal project may have no cards
    expect(Array.isArray(miniTree)).toBe(true);
  });

  test('returns 404 for unknown project prefix', async () => {
    const response = await app.request('/api/projects/nonexistent/cards');
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('nonexistent');
  });

  test('project data does not leak across prefixes', async () => {
    // Fetch a card from decision project
    const decisionCardRes = await app.request(
      '/api/projects/decision/cards/decision_5',
    );
    expect(decisionCardRes.status).toBe(200);

    // The same card key should not exist in the mini project
    const miniCardRes = await app.request(
      '/api/projects/mini/cards/decision_5',
    );
    // Card not found in this project — returned as 400 (bad request)
    expect([400, 404]).toContain(miniCardRes.status);
  });
});
