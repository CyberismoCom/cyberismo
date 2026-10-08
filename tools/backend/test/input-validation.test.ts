import { expect, describe, test, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CommandManager } from '@cyberismo/data-handler';
import { MAX_ATTACHMENT_BYTES } from '@cyberismo/data-handler/utils/constants';
import { createApp } from '../src/app.js';
import { ProjectRegistry } from '../src/project-registry.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

// Tests that invalid input is rejected with a 4xx status, and never ends up
// as a 500 or as a change in the project.
let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

const base = '/api/projects/decision';

beforeAll(async () => {
  process.argv = [];
  tempTestDataPath = await createTempTestData('decision-records');
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(
    new MockAuthProvider(),
    ProjectRegistry.fromCommandManager(commands),
  );
});

afterAll(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

function json(method: string, body: unknown) {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

describe('card routes', () => {
  test.each([
    ['PATCH', `${base}/cards/decision_5`],
    ['POST', `${base}/cards/root`],
    ['POST', `${base}/cards/decision_5/parse`],
  ])('%s %s returns 400 for invalid JSON', async (method, url) => {
    const response = await app.request(url, json(method, '{not json'));
    expect(response.status).toBe(400);
  });

  test.each([
    [{ content: 42 }],
    [{ metadata: 'not an object' }],
    [{ metadata: { title: { nested: true } } }],
    [{ state: '' }],
    [{ parent: '../decision_6' }],
    [{ index: -1 }],
    [{ index: 1.5 }],
    [{ unknownField: 'x' }],
  ])('PATCH returns 400 for invalid body %j', async (body) => {
    const response = await app.request(
      `${base}/cards/decision_5`,
      json('PATCH', body),
    );
    expect(response.status).toBe(400);
  });

  // '.' and '..' are not tested in paths: URL parsing resolves them before routing
  test.each([['decision_5;rm'], ['DECISION_5'], ['decision-5'], ['a%2Fb']])(
    "returns 400 for invalid card key '%s'",
    async (key) => {
      const url = `${base}/cards/${encodeURIComponent(key)}`;
      expect((await app.request(url)).status).toBe(400);
      expect(
        (await app.request(url, json('PATCH', { content: 'x' }))).status,
      ).toBe(400);
      expect((await app.request(url, { method: 'DELETE' })).status).toBe(400);
    },
  );

  test('PATCH returns 404 for an unknown card', async () => {
    const response = await app.request(
      `${base}/cards/decision_doesnotexist`,
      json('PATCH', { content: 'x' }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
  });

  test.each([[{}], [{ template: '' }], [{ template: 42 }]])(
    'POST returns 400 for invalid body %j',
    async (body) => {
      const response = await app.request(
        `${base}/cards/root`,
        json('POST', body),
      );
      expect(response.status).toBe(400);
    },
  );

  test('POST /parse returns 400 without content', async () => {
    const response = await app.request(
      `${base}/cards/decision_5/parse`,
      json('POST', {}),
    );
    expect(response.status).toBe(400);
  });
});

describe('attachments', () => {
  test.each([['..%2Findex.json'], ['a%5Cb'], ['a%00b']])(
    "DELETE returns 400 for file name '%s'",
    async (filename) => {
      const response = await app.request(
        `${base}/cards/decision_5/attachments/${filename}`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(400);
      expect(
        existsSync(join(tempTestDataPath, 'cardRoot/decision_5/index.json')),
      ).toBe(true);
    },
  );

  test('upload over the size limit returns 413', async () => {
    const form = new FormData();
    form.append(
      'files',
      new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1024 * 1024)], 'big.bin'),
    );
    const response = await app.request(`${base}/cards/decision_5/attachments`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(413);
    expect(
      existsSync(join(tempTestDataPath, 'cardRoot/decision_5/a/big.bin')),
    ).toBe(false);
  });

  test('upload within the size limit succeeds', async () => {
    const form = new FormData();
    form.append('files', new File([new Uint8Array(1024)], 'small.bin'));
    const response = await app.request(`${base}/cards/decision_5/attachments`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(200);
  });
});

describe('resource names', () => {
  test.each([
    ['decision/templates/..'],
    ['decision/templates'],
    ['decision/cardTypes/decision'],
    ['decision/templates/a.b'],
    ['../templates/decision'],
  ])("POST /templates/card returns 400 for template '%s'", async (template) => {
    const response = await app.request(
      `${base}/templates/card`,
      json('POST', { template, cardType: 'decision/cardTypes/decision' }),
    );
    expect(response.status).toBe(400);
  });

  test('POST /templates/card returns 400 for an invalid card type', async () => {
    const response = await app.request(
      `${base}/templates/card`,
      json('POST', {
        template: 'decision/templates/decision',
        cardType: 'decision',
      }),
    );
    expect(response.status).toBe(400);
  });

  test.each([['DECISION'], ['de'], ['decision1']])(
    "resource routes return 400 for prefix '%s'",
    async (prefix) => {
      const response = await app.request(
        `${base}/resources/${prefix}/reports/testReport`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(400);
    },
  );

  test('DELETE returns 404 for a resource that does not exist', async () => {
    const response = await app.request(
      `${base}/resources/decision/reports/doesNotExist`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(404);
  });

  test('POST /operation returns 404 for a resource that does not exist', async () => {
    const response = await app.request(
      `${base}/resources/decision/reports/doesNotExist/operation`,
      json('POST', {
        updateKey: { key: 'displayName' },
        operation: { name: 'change', to: 'x' },
      }),
    );
    expect(response.status).toBe(404);
  });

  test('POST /cardTypes returns 400 for an invalid workflow name', async () => {
    const response = await app.request(
      `${base}/cardTypes`,
      json('POST', { identifier: 'newType', workflowName: '../workflow' }),
    );
    expect(response.status).toBe(400);
  });

  test('POST /cardTypes returns 404 for a workflow that does not exist', async () => {
    const response = await app.request(
      `${base}/cardTypes`,
      json('POST', {
        identifier: 'newType',
        workflowName: 'decision/workflows/doesNotExist',
      }),
    );
    expect(response.status).toBe(404);
  });
});

describe('MCP endpoint', () => {
  test('request over the size limit returns 413', async () => {
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(
          Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 2 * 1024 * 1024,
        ),
      },
      body: '{}',
    });
    expect(response.status).toBe(413);
  });
});
