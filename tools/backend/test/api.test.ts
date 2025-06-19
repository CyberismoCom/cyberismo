import { expect, test, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

// Testing env attempts to open project in "../data-handler/test/test-data/valid/decision-records"

// Fixes weird issue with asciidoctor
beforeAll(() => {
  process.argv = [];
});

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

const app = createApp(
  path.resolve(
    dirname,
    '../../data-handler/test/test-data/valid/decision-records',
  ),
);

test('/api/cards returns a project with a list of cards', async () => {
  const response = await app.request('/api/cards');
  expect(response).not.toBe(null);

  const result: any = await response.json();
  expect(response.status).toBe(200);
  expect(result.name).toBe('decision');
  expect(result.workflows.length).toBeGreaterThan(0);
  expect(result.cardTypes.length).toBeGreaterThan(0);
});

test('/api/cards/decision_5 returns a card object', async () => {
  const response = await app.request('/api/cards/decision_5');
  expect(response).not.toBe(null);

  const result: any = await response.json();
  expect(response.status).toBe(200);
  expect(result.title).toBe('Decision Records');
  expect(result.rawContent).not.toBe(null);
});

test('/api/cards/decision_1/a/the-needle.heic returns an attachment file', async () => {
  const response = await app.request('/api/cards/decision_1/a/the-needle.heic');
  expect(response).not.toBe(null);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/heic');
  expect(response.body).not.toBe(null);
});

test('invalid card key returns error', async () => {
  const response = await app.request('/api/cards/bogus');
  expect(response).not.toBe(null);
  expect(response.status).toBe(400);
});

test('test invalid api path returns not found', async () => {
  const response = await app.request('/api/bogus');
  expect(response).not.toBe(null);
  expect(response.status).toBe(400);
});

test('non-existing attachment file returns an error', async () => {
  const response = await app.request('/api/cards/decision_1/a/bogus.gif');
  expect(response).not.toBe(null);
  expect(response.status).toBe(404);
});

test('fieldTypes endpoint returns proper data', async () => {
  const response = await app.request('/api/fieldTypes');
  expect(response).not.toBe(null);

  const result = (await response.json()) as any[];
  expect(response.status).toBe(200);
  expect(result.length).toBe(9);
  expect(result[0].name).toBe('decision/fieldTypes/admins');
  expect(result[0].displayName).toBe('Administrators');
  expect(result[0].description).toBe('List of admin persons');
  expect(result[0].dataType).toBe('list');
});

test('linkTypes endpoint returns proper data', async () => {
  const response = await app.request('/api/linkTypes');
  expect(response).not.toBe(null);

  const result = (await response.json()) as any[];
  expect(response.status).toBe(200);
  expect(result.length).toBe(2);
  expect(result[1].name).toBe('decision/linkTypes/testTypes');
  expect(result[1].sourceCardTypes[0]).toBe('decision/cardTypes/decision');
  expect(result[1].destinationCardTypes[0]).toBe(
    'decision/cardTypes/simplepage',
  );
});

test('templates endpoint returns proper data', async () => {
  const response = await app.request('/api/templates');
  expect(response).not.toBe(null);

  const result = (await response.json()) as any[];
  expect(response.status).toBe(200);
  expect(result.length).toBe(3);
  expect(result[0].name).toBe('decision/templates/decision');
  expect(result[0].metadata.description).toBe('description');
  expect(result[0].metadata.displayName).toBe('Decision');
  expect(result[0].metadata.category).toBe('category');
});

test('tree endpoint returns proper data', async () => {
  const response = await app.request('/api/tree');
  expect(response).not.toBe(null);

  const result = (await response.json()) as any[];
  expect(response.status).toBe(200);
  expect(result[0].key).toBe('decision_5');
  expect(result[0].title).toBe('Decision Records');
  expect(result[0].rank).toBe('0|a');
  expect(result[0].children?.at(0)?.key).toBe('decision_6');
  expect(result[0].children?.at(0)?.title).toBe(
    'Document Decisions with Decision Records',
  );
  expect(result[0].children?.at(0)?.rank).toBe('0|a');
});

const resourceTypes = [
  'calculations',
  'cardTypes',
  'fieldTypes',
  'graphModels',
  'graphViews',
  'linkTypes',
  'reports',
  'templates',
  'workflows',
];

for (const resourceType of resourceTypes) {
  test(`/api/${resourceType} endpoint returns proper data`, async () => {
    const response = await app.request(`/api/resources/${resourceType}`);
    expect(response).not.toBe(null);

    const result = (await response.json()) as any[];
    expect(response.status).toBe(200);
    expect(result).not.toBe(null);
    expect(Array.isArray(result)).toBe(true);
  });
}
