import { expect, test } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

const app = createApp(
  path.resolve(
    dirname,
    '../../data-handler/test/test-data/valid/decision-records',
  ),
);

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
