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

test('/api/logicPrograms returns logic program for a valid card', async () => {
  const response = await app.request(
    '/api/logicPrograms/decision/cards/decision_5',
  );
  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('logicProgram');
  expect(typeof result.logicProgram).toBe('string');
  expect(result.logicProgram.length).toBeGreaterThan(0);
});

test('/api/logicPrograms returns logic program for a valid card type resource', async () => {
  const response = await app.request(
    '/api/logicPrograms/decision/cardTypes/decision',
  );
  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('logicProgram');
  expect(typeof result.logicProgram).toBe('string');
  expect(result.logicProgram.length).toBeGreaterThan(0);
});

test('/api/logicPrograms returns error for non-existent card', async () => {
  const response = await app.request(
    '/api/logicPrograms/decision/cards/nonexistent_card',
  );
  expect(response).not.toBe(null);
  expect(response.status).toBe(500);

  const result = await response.json();
  expect(result).toHaveProperty('error');
  expect(result.error).toContain('nonexistent_card');
});

test('/api/logicPrograms returns error for non-existent resource', async () => {
  const response = await app.request(
    '/api/logicPrograms/decision/cardTypes/nonexistent',
  );
  expect(response).not.toBe(null);
  expect(response.status).toBe(500);

  const result = await response.json();
  expect(result).toHaveProperty('error');
  expect(result.error).toContain('nonexistent');
});
