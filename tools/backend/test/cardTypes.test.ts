// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, test, describe, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

interface CardTypeResponse {
  name: string;
  displayName?: string;
  customFields?: Array<{ name: string; isCalculated?: boolean }>;
  alwaysVisibleFields?: string[];
  optionallyVisibleFields?: string[];
}

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  const ws = await openTestWorkspace(tempTestDataPath);
  app = createApp(new MockAuthProvider(), directoryOf(ws));
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

async function getCardType(name: string): Promise<CardTypeResponse> {
  const response = await app.request('/api/projects/decision/cardTypes');
  expect(response.status).toBe(200);
  const cardTypes = (await response.json()) as CardTypeResponse[];
  const cardType = cardTypes.find((ct) => ct.name === name);
  if (!cardType) throw new Error(`Card type '${name}' not found`);
  return cardType;
}

test('POST /api/projects/:prefix/cardTypes creates a card type successfully', async () => {
  const response = await app.request('/api/projects/decision/cardTypes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-cardtype',
      workflowName: 'decision/workflows/simple',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = (await response.json()) as { message?: string };
  expect(result).toHaveProperty('message');
  expect(result.message).toBeDefined();
  expect(result.message).toBe('Card type created successfully');
});

test('POST /api/projects/:prefix/cardTypes returns error for non-existent workflow', async () => {
  const response = await app.request('/api/projects/decision/cardTypes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-cardtype-nonexistent',
      workflowName: 'nonexistent/workflow',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(500);

  const result = await response.json();
  expect(result).toHaveProperty('error');
});

describe('PATCH /api/projects/:prefix/cardTypes/:cardTypeName/field-visibility', () => {
  const cardTypeName = 'decision/cardTypes/decision';
  const fieldInAlways = 'decision/fieldTypes/admins';
  const fieldInHidden = 'decision/fieldTypes/responsible';

  test('moves field to group with specific index', async () => {
    // Move a field from hidden to always at index 0
    const response = await app.request(
      `/api/projects/decision/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInHidden,
          group: 'always',
          index: 0,
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: 'Field visibility updated successfully',
    });

    // Verify field is at index 0
    const after = await getCardType(cardTypeName);
    expect(after.alwaysVisibleFields?.[0]).toBe(fieldInHidden);
  });

  test('returns 400 for invalid group value', async () => {
    const response = await app.request(
      `/api/projects/decision/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInAlways,
          group: 'invalid-group',
        }),
      },
    );

    expect(response.status).toBe(400);
  });

  test('returns 400 for missing fieldName', async () => {
    const response = await app.request(
      `/api/projects/decision/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group: 'always',
        }),
      },
    );

    expect(response.status).toBe(400);
  });

  test('returns 400 for missing group', async () => {
    const response = await app.request(
      `/api/projects/decision/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInAlways,
        }),
      },
    );

    expect(response.status).toBe(400);
  });
});
