/**
 * @jest-environment node
 */

import { Card, CardDetails, Project } from '@/app/lib/definitions';
import { GET as GET_PROJECT } from '../app/api/cards/route';
import { GET as GET_CARD } from '../app/api/cards/[key]/route';
import { GET as GET_ATTACHMENT } from '../app/api/cards/[key]/a/[attachment]/route';
import { NextRequest } from 'next/server';

// Testing env attempts to open project in "../data-handler/test/test-data/valid/decision-records"

test('/api/cards returns a project with a list of cards', async () => {
  const response = await GET_PROJECT();
  expect(response).not.toBe(null);

  const result: Project = await response.json();
  expect(response.status).toBe(200);
  expect(result.name).toBe('decision');
  expect(result.cards.length).toBeGreaterThan(0);
  expect(result.workflows.length).toBeGreaterThan(0);
  expect(result.cardTypes.length).toBeGreaterThan(0);
});

test('/api/cards/decision_5 returns a card object', async () => {
  const request = new NextRequest(
    'http://localhost:3000/api/cards/decision_5?contentType=adoc',
  );
  const response = await GET_CARD(request);
  expect(response).not.toBe(null);

  const result: CardDetails = await response.json();
  expect(response.status).toBe(200);
  expect(result.metadata!.summary).toBe('Decision Records');
  expect(result.content).not.toBe(null);
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

test('invalid contentType returns error', async () => {
  const request = new NextRequest(
    'http://localhost:3000/api/cards/decision_5?contentType=bogus',
  );
  const response = await GET_CARD(request);
  expect(response).not.toBe(null);
  expect(response.status).toBe(400);
});

test('invalid card key returns error', async () => {
  const request = new NextRequest(
    'http://localhost:3000/api/cards/bogus?contentType=adoc',
  );
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
