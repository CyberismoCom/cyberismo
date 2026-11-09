// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  clingoLogicBackend,
  localFolder,
  LogicUnavailableError,
  type LogicBackendFactory,
} from '@cyberismo/data-handler';

import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

// Clingo, whose queries fail as unavailable while `down` is set.
let down = false;
const logic: LogicBackendFactory = (owner) => {
  const inner = clingoLogicBackend(owner);
  return {
    begin: () => inner.begin(),
    query: async (text) => {
      if (down) throw new LogicUnavailableError('Lost the programs');
      return inner.query(text);
    },
    check: (programs) => inner.check(programs),
    exportText: () => inner.exportText(),
    close: () => inner.close(),
  };
};

// Previews a skill with a query the request supplies; creates the skill
// first.
async function previewQuery(app: ReturnType<typeof createApp>, query: string) {
  const created = await app.request('/api/projects/decision/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'preview' }),
  });
  expect(created.status).toBe(200);
  return app.request(
    '/api/projects/decision/resources/decision/skills/preview/preview',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillQuery: query }),
    },
  );
}

describe('a logic failure thrown in a route', () => {
  let projectPath: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    projectPath = await createTempTestData('decision-records');
    const { directory } = await localFolder(projectPath, { logic });
    app = createApp(new MockAuthProvider(), directory);
  });

  afterAll(async () => {
    await cleanupTempTestData(projectPath);
  });

  it('reaches the central error handler and is served by its code', async () => {
    expect((await app.request('/api/projects/decision/tree')).status).toBe(200);
    down = true;
    try {
      const response = await app.request('/api/projects/decision/tree');

      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('5');
      expect(await response.json()).toMatchObject({
        code: 'logic-unavailable',
      });
    } finally {
      down = false;
    }
  });
});

describe('a project whose programs fail together', () => {
  let projectPath: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    projectPath = await createTempTestData('decision-records');
    // Each calculation is valid on its own; together they define a constant
    // twice.
    const calculations = join(projectPath, '.cards/local/calculations');
    await writeFile(
      join(calculations, 'test/calculation.lp'),
      '#const limit = 1.',
    );
    await mkdir(join(calculations, 'second'));
    await writeFile(
      join(calculations, 'second.json'),
      JSON.stringify({
        name: 'decision/calculations/second',
        displayName: 'Second',
        calculation: '',
      }),
    );
    await writeFile(
      join(calculations, 'second/calculation.lp'),
      '#const limit = 2.',
    );
    const { directory } = await localFolder(projectPath);
    app = createApp(new MockAuthProvider(), directory);
  });

  afterAll(async () => {
    await cleanupTempTestData(projectPath);
  });

  // The stored programs are at fault, not the supplied query: the server's
  // failure, whose diagnostics stay in the log.
  it('serves a supplied query on them as an internal error, without diagnostics', async () => {
    const response = await previewQuery(app, 'result(decision_5).');

    expect(response.status).toBe(500);
    const body = (await response.json()) as { details?: unknown };
    expect(body).toMatchObject({ code: 'logic-internal' });
    expect(body.details).toBe(undefined);
    expect(JSON.stringify(body)).not.toContain('redefinition of constant');
  });
});
