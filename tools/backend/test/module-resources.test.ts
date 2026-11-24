// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test, beforeAll, afterAll } from 'vitest';
import { cp } from 'node:fs/promises';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

// The resource routes are mounted under /api/projects/:projectPrefix. A resource of
// a module has a prefix other than the project prefix, and the routes must
// find it under its own prefix. The project 'test' has the resources of the
// project 'decision-records' installed as the module 'decision'.

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;
let moduleSourcePath: string;

beforeAll(async () => {
  tempTestDataPath = await createTempTestData('module-test');
  moduleSourcePath = await createTempTestData('decision-records');
  await cp(
    join(moduleSourcePath, '.cards', 'local'),
    join(tempTestDataPath, '.cards', 'modules', 'decision'),
    { recursive: true },
  );
  const ws = await openTestWorkspace(tempTestDataPath);
  app = createApp(new MockAuthProvider(), directoryOf(ws));
});

afterAll(async () => {
  await cleanupTempTestData(tempTestDataPath);
  await cleanupTempTestData(moduleSourcePath);
});

test('the workflow graph of a module workflow renders', async () => {
  const response = await app.request(
    '/api/projects/test/resources/decision/workflows/simple/graph',
  );

  expect(response.status).toBe(200);
  const result = (await response.json()) as { svg: string };
  const decoded = Buffer.from(result.svg, 'base64').toString('utf-8');
  expect(decoded).toContain('<svg');
  expect(decoded).toContain('Approved');
}, 20000);

test('a module resource validates under its own prefix', async () => {
  const response = await app.request(
    '/api/projects/test/resources/decision/workflows/simple/validate',
  );

  expect(response.status).toBe(200);
  const result = (await response.json()) as { errors: string[] };
  expect(result.errors).toEqual([]);
});

test('the logic program of a module card type is found', async () => {
  const response = await app.request(
    '/api/projects/test/logicPrograms/decision/cardTypes/decision',
  );

  expect(response.status).toBe(200);
  const result = (await response.json()) as { logicProgram: string };
  expect(result.logicProgram).toContain('decision/cardTypes/decision');
});
