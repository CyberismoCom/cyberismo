import { expect, test, beforeAll, afterAll } from 'vitest';
import { createApp } from '../src/app.js';
import { cleanupTempTestData, createTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeAll(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  app = createApp(tempTestDataPath);
});

afterAll(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

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
  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'displayName',
        operation: {
          name: 'change',
          target: 'Decision card type',
          to: 'Updated Decision Card Type',
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Updated');
});

test('/api/resources/decision/cardTypes/decision/operation performs add operation successfully', async () => {
  const response = await app.request(
    '/api/resources/decision/cardTypes/decision/operation',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: 'alwaysVisibleFields',
        operation: {
          name: 'add',
          target: 'decision/fieldTypes/percentageReady',
        },
      }),
    },
  );

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Updated');
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
        key: 'displayName',
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
