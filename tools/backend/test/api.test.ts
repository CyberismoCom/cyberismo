import { expect, test, beforeAll, afterAll } from 'vitest';
import { CommandManager } from '@cyberismo/data-handler';
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
import { createTempTestData, cleanupTempTestData } from './test-utils.js';

let app: ReturnType<typeof createApp>;
let tempTestDataPath: string;

beforeAll(async () => {
  // Fixes weird issue with asciidoctor
  process.argv = [];
  tempTestDataPath = await createTempTestData('decision-records');
  const commands = await CommandManager.getInstance(tempTestDataPath);
  app = createApp(new MockAuthProvider(), commands);
});

afterAll(async () => {
  await cleanupTempTestData(tempTestDataPath);
});

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

test('connectors endpoint returns connectors data', async () => {
  const response = await app.request('/api/connectors');
  const result = (await response.json()) as {
    name: string;
    displayName: string;
    items: { key: string; title: string }[];
  }[];
  expect(response.status).toBe(200);
  expect(Array.isArray(result)).toBe(true);
  expect(result).toHaveLength(0);
});

test('POST /api/cards/:key/links creates a link successfully', async () => {
  const response = await app.request('/api/cards/decision_5/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link created successfully');
});

test('POST /api/cards/:key/links creates an inbound link successfully', async () => {
  // direction='inbound' means decision_6 links TO decision_5 (key is the destination)
  const response = await app.request('/api/cards/decision_5/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'inbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link created successfully');
});

test('DELETE /api/cards/:key/links removes an inbound link successfully', async () => {
  const response = await app.request('/api/cards/decision_5/links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'inbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link removed successfully');
});

test('DELETE /api/cards/:key/links removes a link successfully', async () => {
  const response = await app.request('/api/cards/decision_5/links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link removed successfully');
});

test('POST /api/cards/:key/links creates external link successfully', async () => {
  const response = await app.request('/api/cards/decision_5/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'jira:TEST-123',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link created successfully');
});

test('DELETE /api/cards/:key/links removes external link successfully', async () => {
  const response = await app.request('/api/cards/decision_5/links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'jira:TEST-123',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link removed successfully');
});

test('PATCH /api/cards/:key/links changes link type', async () => {
  // testTypes requires source=decision cardType, destination=simplepage cardType
  // decision_6 is 'decision' cardType, decision_5 is 'simplepage' cardType
  await app.request('/api/cards/decision_6/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_5',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    }),
  });

  const response = await app.request('/api/cards/decision_6/links', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_5',
      linkType: 'decision/linkTypes/testTypes',
      direction: 'outbound',
      previousToCard: 'decision_5',
      previousLinkType: 'decision/linkTypes/test',
      previousDirection: 'outbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link updated successfully');

  // Cleanup
  await app.request('/api/cards/decision_6/links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_5',
      linkType: 'decision/linkTypes/testTypes',
      direction: 'outbound',
    }),
  });
});

test('PATCH /api/cards/:key/links changes link direction', async () => {
  // Create initial outbound link
  await app.request('/api/cards/decision_5/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    }),
  });

  const response = await app.request('/api/cards/decision_5/links', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'inbound',
      previousToCard: 'decision_6',
      previousLinkType: 'decision/linkTypes/test',
      previousDirection: 'outbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link updated successfully');

  // Cleanup
  await app.request('/api/cards/decision_5/links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'inbound',
    }),
  });
});

test('PATCH /api/cards/:key/links changes link description', async () => {
  // Create initial link without description
  await app.request('/api/cards/decision_5/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
    }),
  });

  const response = await app.request('/api/cards/decision_5/links', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
      description: 'new description',
      previousToCard: 'decision_6',
      previousLinkType: 'decision/linkTypes/test',
      previousDirection: 'outbound',
    }),
  });
  const result = (await response.json()) as { message: string };
  expect(response.status).toBe(200);
  expect(result.message).toBe('Link updated successfully');

  // Cleanup
  await app.request('/api/cards/decision_5/links', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      direction: 'outbound',
      description: 'new description',
    }),
  });
});

test('PATCH /api/cards/:key/links returns 400 when required fields are missing', async () => {
  const response = await app.request('/api/cards/decision_5/links', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      toCard: 'decision_6',
      linkType: 'decision/linkTypes/test',
      // missing direction, previousToCard, previousLinkType, previousDirection
    }),
  });
  expect(response.status).toBe(400);
});
