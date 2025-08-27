import { expect, test, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('module-test');
  app = createApp(tempTestDataPath);
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

test('POST /api/templates creates a template successfully', async () => {
  const response = await app.request('/api/templates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-template',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Template created successfully');
});

test('POST /api/templates/card creates a template card successfully', async () => {
  const response = await app.request('/api/templates/card', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'test/templates/page',
      cardType: 'test/cardTypes/page',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('cards');
  expect(Array.isArray(result.cards)).toBe(true);
  expect(result.cards.length).toBeGreaterThan(0);
});

test('POST /api/templates/card creates a template card with parent successfully', async () => {
  // First create a card to use as parent
  const createResponse = await app.request('/api/templates/card', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'test/templates/page',
      cardType: 'test/cardTypes/page',
    }),
  });

  expect(createResponse.status).toBe(200);
  const createResult = await createResponse.json();
  const parentKey = createResult.cards[0];

  // Now create a child card
  const response = await app.request('/api/templates/card', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'test/templates/page',
      cardType: 'test/cardTypes/page',
      parentKey: parentKey,
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('cards');
  expect(Array.isArray(result.cards)).toBe(true);
  expect(result.cards.length).toBeGreaterThan(0);
});

test('POST /api/templates/card creates multiple template cards with count property', async () => {
  const response = await app.request('/api/templates/card', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template: 'test/templates/page',
      cardType: 'test/cardTypes/page',
      count: 3,
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('cards');
  expect(Array.isArray(result.cards)).toBe(true);
  expect(result.cards.length).toBe(3);
});
