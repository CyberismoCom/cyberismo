import { expect, test, describe, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

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
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(new MockAuthProvider(), commands);
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

async function getCardType(name: string): Promise<CardTypeResponse> {
  const response = await app.request('/api/cardTypes');
  expect(response.status).toBe(200);
  const cardTypes = (await response.json()) as CardTypeResponse[];
  const cardType = cardTypes.find((ct) => ct.name === name);
  if (!cardType) throw new Error(`Card type '${name}' not found`);
  return cardType;
}

test('POST /api/cardTypes creates a card type successfully', async () => {
  const response = await app.request('/api/cardTypes', {
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

test('POST /api/cardTypes returns error for non-existent workflow', async () => {
  const response = await app.request('/api/cardTypes', {
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

describe('PATCH /api/cardTypes/:cardTypeName/field-visibility', () => {
  const cardTypeName = 'decision/cardTypes/decision';
  const fieldInAlways = 'decision/fieldTypes/admins';
  const fieldInHidden = 'decision/fieldTypes/responsible';

  test('moves field from always to optional', async () => {
    // Verify initial state
    const before = await getCardType(cardTypeName);
    expect(before.alwaysVisibleFields).toContain(fieldInAlways);
    expect(before.optionallyVisibleFields).not.toContain(fieldInAlways);

    // Move field
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInAlways,
          group: 'optional',
        }),
      },
    );

    expect(response.status).toBe(200);
    const result = (await response.json()) as { message?: string };
    expect(result.message).toBeDefined();
    expect(result.message).toBe('Field visibility updated successfully');

    // Verify field moved
    const after = await getCardType(cardTypeName);
    expect(after.alwaysVisibleFields).not.toContain(fieldInAlways);
    expect(after.optionallyVisibleFields).toContain(fieldInAlways);
  });

  test('moves field from optional to hidden', async () => {
    // First move a field to optional
    await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInAlways,
          group: 'optional',
        }),
      },
    );

    // Verify it's in optional
    const before = await getCardType(cardTypeName);
    expect(before.optionallyVisibleFields).toContain(fieldInAlways);

    // Move to hidden
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInAlways,
          group: 'hidden',
        }),
      },
    );

    expect(response.status).toBe(200);

    // Verify field is now hidden (not in any visibility array)
    const after = await getCardType(cardTypeName);
    expect(after.alwaysVisibleFields).not.toContain(fieldInAlways);
    expect(after.optionallyVisibleFields).not.toContain(fieldInAlways);
  });

  test('moves field from hidden to always', async () => {
    // Verify initial state - fieldInHidden should not be in any visibility array
    const before = await getCardType(cardTypeName);
    expect(before.alwaysVisibleFields).not.toContain(fieldInHidden);
    expect(before.optionallyVisibleFields).not.toContain(fieldInHidden);

    // Move to always
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInHidden,
          group: 'always',
        }),
      },
    );

    expect(response.status).toBe(200);

    // Verify field is now in always
    const after = await getCardType(cardTypeName);
    expect(after.alwaysVisibleFields).toContain(fieldInHidden);
  });

  test('reorders field within same group', async () => {
    // Get initial state
    const before = await getCardType(cardTypeName);
    const initialAlways = before.alwaysVisibleFields || [];
    expect(initialAlways.length).toBeGreaterThan(1);

    // Move the second field to index 0
    const fieldToMove = initialAlways[1];
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldToMove,
          group: 'always',
          index: 0,
        }),
      },
    );

    expect(response.status).toBe(200);

    // Verify field moved to index 0
    const after = await getCardType(cardTypeName);
    expect(after.alwaysVisibleFields?.[0]).toBe(fieldToMove);
  });

  test('moves field to group with specific index', async () => {
    // Move a field from hidden to always at index 0
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
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

    // Verify field is at index 0
    const after = await getCardType(cardTypeName);
    expect(after.alwaysVisibleFields?.[0]).toBe(fieldInHidden);
  });

  test('returns 404 for non-existent field', async () => {
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: 'nonexistent/fieldTypes/fake',
          group: 'always',
        }),
      },
    );

    expect(response.status).toBe(404);
    const result = (await response.json()) as { error?: string };
    expect(result.error).toBeDefined();
    expect(result.error).toContain('does not exist');
  });

  test('returns 404 for non-existent card type', async () => {
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent('nonexistent/cardTypes/fake')}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInAlways,
          group: 'always',
        }),
      },
    );

    expect(response.status).toBe(404);
  });

  test('returns 400 for invalid group value', async () => {
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
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
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
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
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
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

  test('no-op when moving hidden field to hidden', async () => {
    // This should succeed without error
    const response = await app.request(
      `/api/cardTypes/${encodeURIComponent(cardTypeName)}/field-visibility`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldName: fieldInHidden,
          group: 'hidden',
        }),
      },
    );

    expect(response.status).toBe(200);
  });
});
