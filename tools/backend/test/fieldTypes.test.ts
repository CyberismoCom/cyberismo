import { expect, test, beforeEach, afterEach } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeEach(async () => {
  tempTestDataPath = await createTempTestData('decision-records');
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(new MockAuthProvider(), commands);
});

afterEach(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

test('POST /api/fieldTypes creates a field type successfully', async () => {
  const response = await app.request('/api/fieldTypes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      identifier: 'test-fieldtype',
      dataType: 'shortText',
    }),
  });

  expect(response).not.toBe(null);
  expect(response.status).toBe(200);

  const result = await response.json();
  expect(result).toHaveProperty('message');
  expect(result.message).toBe('Field type created successfully');
});

test('POST /api/fieldTypes creates field type with different data types', async () => {
  const validDataTypes = [
    'boolean',
    'date',
    'dateTime',
    'enum',
    'integer',
    'list',
    'longText',
    'number',
    'person',
    'shortText',
  ];

  for (const dataType of validDataTypes) {
    const response = await app.request('/api/fieldTypes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier: `test-fieldtype-${dataType}`,
        dataType: dataType,
      }),
    });

    expect(response).not.toBe(null);
    expect(response.status).toBe(200);

    const result = await response.json();
    expect(result).toHaveProperty('message');
    expect(result.message).toBe('Field type created successfully');
  }
});
