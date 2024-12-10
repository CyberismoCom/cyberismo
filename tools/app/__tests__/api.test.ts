/**
 * @jest-environment node
 */

import { Project } from '@/app/lib/definitions';
import { GET as GET_PROJECT } from '../app/api/cards/route';
import { GET as GET_CARD } from '../app/api/cards/[key]/route';
import { GET as GET_ATTACHMENT } from '../app/api/cards/[key]/a/[attachment]/route';
import { GET as GET_CARD_TYPE } from '../app/api/cardTypes/route';
import { GET as GET_FIELD_TYPES } from '../app/api/fieldTypes/route';
import { GET as GET_LINK_TYPES } from '../app/api/linkTypes/route';
import { GET as GET_TEMPLATES } from '../app/api/templates/route';
import { GET as GET_TREE } from '../app/api/tree/route';
import { NextRequest } from 'next/server';
import {
  CardType,
  FieldType,
  LinkType,
} from '@cyberismocom/data-handler/interfaces/resource-interfaces';

import { QueryResult } from '@cyberismocom/data-handler/types/queries';
import { TemplateConfiguration } from '@cyberismocom/data-handler/interfaces/project-interfaces';
import { CardResponse } from '@/app/lib/api/types';

// Testing env attempts to open project in "../data-handler/test/test-data/valid/decision-records"

// Fixes weird issue with asciidoctor
beforeAll(() => {
  process.argv = [];
});

test('/api/cards returns a project with a list of cards', async () => {
  const response = await GET_PROJECT();
  expect(response).not.toBe(null);

  const result: Project = await response.json();
  expect(response.status).toBe(200);
  expect(result.name).toBe('decision');
  expect(result.workflows.length).toBeGreaterThan(0);
  expect(result.cardTypes.length).toBeGreaterThan(0);
});

test('/api/cards/decision_5 returns a card object', async () => {
  const request = new NextRequest('http://localhost:3000/api/cards/decision_5');
  const response = await GET_CARD(request);
  expect(response).not.toBe(null);

  const result: CardResponse = await response.json();
  expect(response.status).toBe(200);
  expect(result.title).toBe('Decision Records');
  expect(result.rawContent).not.toBe(null);
});

test('/api/cards/decision_1/a/the-needle.heic returns an attachment file', async () => {
  const request = new NextRequest(
    'http://localhost:3000/api/cards/decision_1/a/the-needle.heic',
  );
  const response = await GET_ATTACHMENT(request);
  expect(response).not.toBe(null);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/heic');
  expect(response.body).not.toBe(null);
});

test('invalid card key returns error', async () => {
  const request = new NextRequest('http://localhost:3000/api/cards/bogus');
  const response = await GET_CARD(request);
  expect(response).not.toBe(null);
  expect(response.status).toBe(400);
});

test('non-existing attachment file returns an error', async () => {
  const request = new NextRequest(
    'http://localhost:3000/api/cards/decision_1/a/bogus.gif',
  );
  const response = await GET_ATTACHMENT(request);
  expect(response).not.toBe(null);
  expect(response.status).toBe(404);
});

test('cardTypes endpoint returns card type object', async () => {
  const request = new NextRequest(
    'http://localhost:3000/api/cards/cardTypes?name=decision/cardTypes/decision',
  );
  const response = await GET_CARD_TYPE(request);
  expect(response).not.toBe(null);

  const result: CardType = await response.json();
  expect(response.status).toBe(200);
  expect(result.name).toBe('decision/cardTypes/decision');
  expect(result.workflow).toBe('decision/workflows/decision');
});

test('fieldTypes endpoint returns proper data', async () => {
  const response = await GET_FIELD_TYPES();
  expect(response).not.toBe(null);

  const result: FieldType[] = await response.json();
  expect(response.status).toBe(200);
  expect(result.length).toBe(9);
  expect(result[0].name).toBe('decision/fieldTypes/admins');
  expect(result[0].displayName).toBe('Administrators');
  expect(result[0].fieldDescription).toBe('List of admin persons');
  expect(result[0].dataType).toBe('list');
});

test('linkTypes endpoint returns proper data', async () => {
  const response = await GET_LINK_TYPES();
  expect(response).not.toBe(null);

  const result: LinkType[] = await response.json();
  expect(response.status).toBe(200);
  expect(result.length).toBe(2);
  expect(result[1].name).toBe('decision/linkTypes/testTypes');
  expect(result[1].sourceCardTypes[0]).toBe('decision/cardTypes/decision');
  expect(result[1].destinationCardTypes[0]).toBe(
    'decision/cardTypes/simplepage',
  );
});

test('templates endpoint returns proper data', async () => {
  const response = await GET_TEMPLATES();
  expect(response).not.toBe(null);

  const result: TemplateConfiguration[] = await response.json();
  expect(response.status).toBe(200);
  expect(result.length).toBe(3);
  expect(result[0].name).toBe('decision/templates/decision');
  expect(result[0].metadata.description).toBe('description');
  expect(result[0].metadata.displayName).toBe('Decision');
  expect(result[0].metadata.category).toBe('category');
});

test('tree endpoint returns proper data', async () => {
  const response = await GET_TREE();
  expect(response).not.toBe(null);

  const result: QueryResult<'tree'>[] = await response.json();
  expect(response.status).toBe(200);
  expect(result[0].key).toBe('decision_5');
  expect(result[0].title).toBe('Decision Records');
  expect(result[0].rank).toBe('0|a');
  expect(result[0].workflowStateCategory).toBe('initial');
  expect(result[0].children?.at(0)?.key).toBe('decision_6');
  expect(result[0].children?.at(0)?.title).toBe(
    'Document Decisions with Decision Records',
  );
  expect(result[0].children?.at(0)?.rank).toBe('0|a');
  expect(result[0].children?.at(0)?.workflowStateCategory).toBe('closed');
});
