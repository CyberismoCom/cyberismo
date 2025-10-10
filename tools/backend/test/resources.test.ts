import { expect, test, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

interface CardTypeResponse {
  name: string;
  displayName?: string;
  alwaysVisibleFields?: string[];
}

beforeAll(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  app = createApp(tempTestDataPath);
});

afterAll(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

async function getCardTypeByName(name: string): Promise<CardTypeResponse> {
  const response = await app.request('/api/cardTypes');
  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const cardTypes = (await response.json()) as CardTypeResponse[];
  expect(Array.isArray(cardTypes)).toBe(true);

  const cardType = cardTypes.find((item) => item.name === name);
  if (!cardType) {
    throw new Error(`Card type '${name}' not found in response`);
  }

  return cardType;
}

test('/api/resources/decision/fieldTypes/admins/validate returns validation result for valid field type', async () => {
  const response = await app.request(
    '/api/resources/decision/fieldTypes/admins/validate',
  );
  expect(response).not.toBe(null);

  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result).toHaveProperty('errors');
  expect(Array.isArray(result.errors)).toBe(true);

  expect(result.errors.every((error: string) => error === '')).toBe(true);
});

test('/api/resources/decision/cardTypes/decision/validate returns validation result for valid card type', async () => {
  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/validate',
  );
  expect(response).not.toBe(null);

  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result).toHaveProperty('errors');
  expect(result.errors).toEqual([]);
});

test('/api/resources/decision/cardTypes/decision/operation performs change operation successfully', async () => {
  const cardTypeBefore = await getCardTypeByName('decision/cardTypes/decision');
  expect(cardTypeBefore.displayName).toBeDefined();

  const originalDisplayName = cardTypeBefore.displayName as string;
  const updatedDisplayName = originalDisplayName.endsWith(' (test)')
    ? `${originalDisplayName} updated`
    : `${originalDisplayName} (test)`;

  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateKey: { key: 'displayName' },
        operation: {
          name: 'change',
          target: originalDisplayName,
          to: updatedDisplayName,
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Updated');

  const cardTypeAfter = await getCardTypeByName('decision/cardTypes/decision');
  expect(cardTypeAfter.displayName).toBe(updatedDisplayName);

  const revertResponse = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateKey: {
          key: 'displayName',
        },
        operation: {
          name: 'change',
          target: updatedDisplayName,
          to: originalDisplayName,
        },
      }),
    },
  );

  expect(revertResponse).not.toBe(null);
  expect(revertResponse.status).toBe(200);

  const cardTypeRestored = await getCardTypeByName(
    'decision/cardTypes/decision',
  );
  expect(cardTypeRestored.displayName).toBe(originalDisplayName);
});

test('/api/resources/decision/cardTypes/decision/operation performs add operation successfully', async () => {
  const targetField = 'decision/fieldTypes/percentageReady';
  const cardTypeBefore = await getCardTypeByName('decision/cardTypes/decision');
  const beforeFields = [...(cardTypeBefore.alwaysVisibleFields ?? [])];

  expect(beforeFields).not.toContain(targetField);

  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateKey: {
          key: 'alwaysVisibleFields',
        },
        operation: {
          name: 'add',
          target: targetField,
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Updated');

  const cardTypeAfter = await getCardTypeByName('decision/cardTypes/decision');
  const afterFields = cardTypeAfter.alwaysVisibleFields ?? [];

  expect(afterFields).to.contain(targetField);
});

test('/api/resources/decision/cardTypes/decision/operation performs rank operation successfully', async () => {
  const targetField = 'decision/fieldTypes/commitDescription';
  const cardTypeBefore = await getCardTypeByName('decision/cardTypes/decision');
  const beforeFields = [...(cardTypeBefore.alwaysVisibleFields ?? [])];

  const initialIndex = beforeFields.indexOf(targetField);
  expect(initialIndex).toBeGreaterThan(-1);

  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateKey: {
          key: 'alwaysVisibleFields',
        },
        operation: {
          name: 'rank',
          target: targetField,
          newIndex: 1,
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Updated');

  const cardTypeAfter = await getCardTypeByName('decision/cardTypes/decision');
  const afterFields = cardTypeAfter.alwaysVisibleFields ?? [];

  expect(afterFields.indexOf(targetField)).toBe(1);
  expect(afterFields.indexOf(targetField)).not.toBe(initialIndex);
  expect(afterFields.length).toBe(beforeFields.length);
  expect(afterFields.filter((field) => field !== targetField)).toEqual(
    beforeFields.filter((field) => field !== targetField),
  );
});

test('/api/resources/decision/cardTypes/decision/operation performs remove operation successfully', async () => {
  const targetField = 'decision/fieldTypes/commitDescription';
  const cardTypeBefore = await getCardTypeByName('decision/cardTypes/decision');
  const beforeFields = [...(cardTypeBefore.alwaysVisibleFields ?? [])];

  expect(beforeFields).toContain(targetField);

  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateKey: {
          key: 'alwaysVisibleFields',
        },
        operation: {
          name: 'remove',
          target: targetField,
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Updated');

  const cardTypeAfter = await getCardTypeByName('decision/cardTypes/decision');
  const afterFields = cardTypeAfter.alwaysVisibleFields ?? [];

  expect(afterFields).not.toContain(targetField);
  expect(afterFields.length).toBe(beforeFields.length - 1);
  expect(afterFields).toEqual(
    beforeFields.filter((field) => field !== targetField),
  );
});

test('/api/resources/decision/cardTypes/decision/operation returns 400 for invalid operation', async () => {
  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateKey: { key: 'displayName' },
        operation: {
          name: 'invalid_operation',
          target: 'some value',
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(400);
});

test('/api/resources/decision/cardTypes/decision/operation returns 500 for invalid key', async () => {
  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        updateKey: {
          key: 'displayNameButNot',
        },
        operation: {
          name: 'remove',
          target: '',
          to: 'New Display Name',
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(500);
});
