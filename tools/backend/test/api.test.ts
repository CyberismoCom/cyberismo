import { expect, test, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { MockAuthProvider } from '../src/auth/mock.js';
import { type QueryResult } from '@cyberismo/data-handler/types/queries';
import type {
  CardType,
  FieldType,
  LinkType,
  TemplateConfiguration,
  Workflow,
} from '@cyberismo/data-handler/interfaces/resource-interfaces';
import type { CardAttachment } from '@cyberismo/data-handler/interfaces/project-interfaces';

// Testing env attempts to open project in "../data-handler/test/test-data/valid/decision-records"

// Fixes weird issue with asciidoctor
beforeAll(() => {
  process.argv = [];
});

const fileUrl = fileURLToPath(import.meta.url);
const dirname = path.dirname(fileUrl);

const app = createApp(
  new MockAuthProvider(),
  path.resolve(
    dirname,
    '../../data-handler/test/test-data/valid/decision-records',
  ),
);

type CardApiResponse = QueryResult<'card'> & {
  rawContent: string;
  parsedContent: string;
  attachments?: CardAttachment[];
};

type ProjectInfoResponse = {
  name: string;
  prefix: string;
  workflows: Workflow[];
  cardTypes: CardType[];
};

test('/api/cards returns a project with a list of cards', async () => {
  const response = await app.request('/api/cards');
  expect(response).not.toBe(null);

  const result = (await response.json()) as ProjectInfoResponse;
  expect(response.status).toBe(200);
  expect(result.name).toBe('decision');
  expect(result.workflows.length).toBeGreaterThan(0);
  expect(result.cardTypes.length).toBeGreaterThan(0);
});

test('/api/cards/decision_5 returns a card object', async () => {
  const response = await app.request('/api/cards/decision_5');
  expect(response).not.toBe(null);

  const result = (await response.json()) as CardApiResponse;
  expect(response.status).toBe(200);
  expect(result.title).toBe('Decision Records');
  expect(result.rawContent).not.toBe(null);
  expect(result.labels).not.toBe(null);
  expect(result.links).not.toBe(null);
  expect(result.notifications).not.toBe(null);
  expect(result.policyChecks).not.toBe(null);
  expect(result.deniedOperations).not.toBe(null);
  expect(result.fields).not.toBe(null);
  expect(result.cardTypeDisplayName).toBe('Simple card type');
  expect(result.cardType).toBe('decision/cardTypes/simplepage');
});

test('/api/cards/decision_5?raw=true returns raw card data without calculated extras', async () => {
  const response = await app.request('/api/cards/decision_5?raw=true');
  expect(response).not.toBe(null);

  const result = (await response.json()) as CardApiResponse;
  expect(response.status).toBe(200);
  expect(result.title).toBe('Decision Records');
  expect(result.workflowState).toBe('');
  expect(Array.isArray(result.links)).toBe(true);
  expect(Array.isArray(result.notifications)).toBe(true);
  expect(Array.isArray(result.attachments)).toBe(true);
  expect(result.cardTypeDisplayName).toBe('decision/cardTypes/simplepage');
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

  const result = (await response.json()) as FieldType[];
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

  const result = (await response.json()) as LinkType[];
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

  const result = (await response.json()) as TemplateConfiguration[];
  expect(response.status).toBe(200);
  expect(result.length).toBe(3);
  expect(result[0].name).toBe('decision/templates/decision');
  expect(result[0].description).toBe('description');
  expect(result[0].displayName).toBe('Decision');
  expect(result[0].category).toBe('category');
});

test('tree endpoint returns proper data', async () => {
  const response = await app.request('/api/tree');
  expect(response).not.toBe(null);

  const result = (await response.json()) as QueryResult<'tree'>[];
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

test('labels endpoint returns the list of labels', async () => {
  const response = await app.request('/api/labels');
  expect(response).not.toBe(null);

  const result = (await response.json()) as string[];
  expect(response.status).toBe(200);
  expect(Array.isArray(result)).toBe(true);
  expect(result).toContain('test');
});
