// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// run_query and run_graph fill the inputs their logic programs need.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/server.js';
import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';
import { authenticated } from './test-utils.js';
import {
  openTestWorkspace,
  directoryOf,
} from './helpers/open-test-workspace.js';

let project: BuiltProject;
let client: Client;
let top: string, childA: string, childB: string, other: string;

beforeAll(async () => {
  project = await buildProject({
    cardTypes: [{ name: 'page' }],
    calculations: {
      effects:
        'onTransitionSetField(X, "To Closed", X, "title", "Done") :- field(X, "title", "Top").',
    },
    graphModels: { children: 'node(C) :- parent(C, Root), viewRoot(Root).' },
    graphViews: { children: { view: 'viewRoot({{cardKey}}).' } },
    cards: [
      { title: 'Top', children: [{ title: 'Child A' }, { title: 'Child B' }] },
      { title: 'Other' },
    ],
  });
  [top, childA, childB, other] = project.keys;
  const ws = await openTestWorkspace(project.path);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await createMcpServer(directoryOf(ws)).connect(
    authenticated(serverTransport),
  );
  client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
  await project.cleanup();
});

const callTool = async (name: string, args: Record<string, unknown>) => {
  const result = await client.callTool({
    name,
    arguments: { projectPrefix: 'test', ...args },
  });
  const text = (result.content as { text: string }[])[0].text;
  return { isError: result.isError, text };
};

describe('run_query', () => {
  test('gives only the card asked for', async () => {
    const { isError, text } = await callTool('run_query', {
      queryName: 'card',
      cardKey: childA,
    });

    expect(isError, text).toBeFalsy();
    const { results } = JSON.parse(text);
    expect(results.map((card: { key: string }) => card.key)).toEqual([childA]);
  });

  test('gives the subtree of the card asked for', async () => {
    const { isError, text } = await callTool('run_query', {
      queryName: 'tree',
      cardKey: top,
    });

    expect(isError, text).toBeFalsy();
    const { results } = JSON.parse(text);
    expect(results.map((card: { key: string }) => card.key)).toEqual([top]);
  });

  test('gives the side effects of a transition', async () => {
    const { isError, text } = await callTool('run_query', {
      queryName: 'onTransition',
      cardKey: top,
      transition: 'To Closed',
    });

    expect(isError, text).toBeFalsy();
    const { results } = JSON.parse(text);
    expect(results[0].updateFields).toEqual([
      expect.objectContaining({ card: top, field: 'title', newValue: 'Done' }),
    ]);
  });

  test.each([
    [{ queryName: 'onTransition' }, /Invalid options for query 'onTransition'/],
    [{ queryName: 'onCreation' }, /Invalid options for query 'onCreation'/],
    [{ queryName: 'card', cardKey: 'test_missing' }, /does not exist/],
  ])('refuses %j', async (args, message) => {
    const { isError, text } = await callTool('run_query', args);

    expect(isError).toBe(true);
    expect(text).toMatch(message);
  });
});

describe('run_graph', () => {
  test('returns the SVG of the view drawn for the card', async () => {
    const { isError, text } = await callTool('run_graph', {
      model: 'test/graphModels/children',
      view: 'test/graphViews/children',
      cardKey: top,
    });

    expect(isError, text).toBeFalsy();
    expect(text).toMatch(/<svg/);
    expect(text).toContain(childA);
    expect(text).toContain(childB);
    expect(text).not.toContain(other);
  });

  test.each([
    [{ view: 'test/graphViews/nope' }, /test\/graphViews\/nope/],
    [{ view: 'test/graphViews/children', cardKey: 'x' }, /'x' does not exist/],
    [{ view: 'test/graphViews/children' }, /may need a cardKey/],
  ])('refuses %j', async (args, message) => {
    const { isError, text } = await callTool('run_graph', {
      model: 'test/graphModels/children',
      ...args,
    });

    expect(isError).toBe(true);
    expect(text).toMatch(message);
  });
});
