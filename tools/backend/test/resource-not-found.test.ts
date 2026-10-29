// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Workspace } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

const P = '/api/projects/decision';
let app: ReturnType<typeof createApp>;
let path: string;
let ws: Workspace;

beforeEach(async () => {
  path = await createTempTestData('decision-records');
  ws = await openTestWorkspace(path);
  app = createApp(new MockAuthProvider(), directoryOf(ws));
});

afterEach(async () => {
  await cleanupTempTestData(path);
});

const operation = (updateKey: string, op: object) => ({
  method: 'POST',
  body: { updateKey: { key: updateKey }, operation: op },
});

// A missing resource is a 404 with code 'not-found', whichever lookup misses.
test.each([
  [
    'edit of a missing resource',
    `${P}/resources/decision/cardTypes/nope/operation`,
    operation('displayName', { name: 'change', target: '', to: 'X' }),
    "Resource 'decision/cardTypes/nope' does not exist",
  ],
  [
    'rename of a missing resource',
    `${P}/resources/decision/workflows/nope/operation`,
    operation('name', {
      name: 'change',
      target: 'decision/workflows/nope',
      to: 'decision/workflows/renamed',
    }),
    "Resource 'nope' does not exist",
  ],
  [
    'delete of a missing resource',
    `${P}/resources/decision/linkTypes/nope`,
    { method: 'DELETE' },
    "Resource 'nope' does not exist in the project",
  ],
  [
    'a missing field type added to a card type',
    `${P}/resources/decision/cardTypes/decision/operation`,
    operation('customFields', {
      name: 'add',
      target: { name: 'decision/fieldTypes/nope' },
    }),
    "Field type 'decision/fieldTypes/nope' does not exist in the project",
  ],
])('%s', async (_, url, { method, body }, message) => {
  const response = await app.request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ code: 'not-found', message });
});

test.each([
  [
    'a missing card type',
    'decision/cardTypes/nope',
    'decision/fieldTypes/responsible',
    "CardType 'decision/cardTypes/nope' does not exist in the project",
  ],
  [
    'a field the card type lacks',
    'decision/cardTypes/decision',
    'decision/fieldTypes/nope',
    "Field 'decision/fieldTypes/nope' does not exist in card type 'decision/cardTypes/decision'. ",
  ],
])('field visibility of %s is a 404', async (_, cardType, fieldName, error) => {
  const response = await app.request(
    `${P}/cardTypes/${encodeURIComponent(cardType)}/field-visibility`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fieldName, group: 'hidden' }),
    },
  );
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error });
});
