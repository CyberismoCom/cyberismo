// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// The "Action macro demo" of module-test: a card is created from the demo
// template, its report is rendered, and every button is clicked in the order
// of the report. Each gives the outcome the report text promises.

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import type { ActionResult } from '@cyberismo/model';
import type { Workspace } from '../../src/api/workspace.js';
import { actionButtons } from '../helpers/action-buttons.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { childKeys, metadataOf } from '../domain/cards/fixture.js';

const MODULE_TEST = join(import.meta.dirname, '../../../../module-test');

let dir: string;
afterEach(() => rm(dir, { recursive: true, force: true }));

type Check = (result: ActionResult) => Promise<void>;
type Outcome = Check | RegExp;

it('every button of the action macro demo does what the report says', async () => {
  dir = await mkdtemp(join(tmpdir(), 'cyberismo-action-demo-'));
  await cp(MODULE_TEST, dir, {
    recursive: true,
    filter: (source) => !/[/\\]\.(logs|calc|temp)$/.test(source),
  });
  const ws: Workspace = await openTestWorkspace(dir);

  const [host] = await ws.cards.create('test/templates/actionDemo');
  const { content } = await ws.cards.details(host.key);
  const rendered = await ws.render.macros(content!, {
    cardKey: host.key,
    context: 'localApp',
    mode: 'inject',
  });
  const buttons = actionButtons(rendered);

  const meta = (key: string) => metadataOf(ws, key);
  const child = async (title: string) => {
    const keys = (await ws.cards.details(host.key)).children;
    for (const key of keys) if ((await meta(key)).title === title) return key;
    throw new Error(`no child ${title}`);
  };
  const notes = await child('Notes');
  const source = await child('Source text');
  const target = await child('Link target');
  const movable = await child('Movable page');
  const hostMeta = () => meta(host.key);
  const before = await hostMeta();
  let lastUpdated: string | undefined;

  const outcomes: [string, Outcome][] = [
    [
      'Approve',
      async () => expect((await hostMeta()).workflowState).toBe('Approved'),
    ],
    [
      'Add page',
      async ({ created }) => {
        expect(created.map((card) => card.title)).toEqual(['Untitled page']);
        expect((await ws.cards.details(host.key)).children).toContain(
          created[0].key,
        );
      },
    ],
    [
      'Add named page',
      async ({ created }) => {
        const named = await meta(created[0].key);
        expect([named.title, named.labels]).toEqual(['Named page', ['named']]);
      },
    ],
    [
      'Set fields',
      async () =>
        expect(await hostMeta()).toMatchObject({
          'test/fieldTypes/shortText': 'Set by an action',
          'test/fieldTypes/integer': 42,
        }),
    ],
    [
      'Add label',
      async () =>
        expect((await hostMeta()).labels).toEqual(['demo', 'reviewed']),
    ],
    [
      'Remove label',
      async () => expect((await hostMeta()).labels).toEqual(['demo']),
    ],
    [
      'Add link',
      async () =>
        expect((await hostMeta()).links).toEqual([
          { cardKey: target, linkType: 'test/linkTypes/test' },
        ]),
    ],
    ['Remove link', async () => expect((await hostMeta()).links).toEqual([])],
    [
      'Set content',
      async () =>
        expect((await ws.cards.details(notes)).content).toBe(
          '== Checklist\n\n. Read the demo.\n. Click every button.',
        ),
    ],
    [
      'Copy content',
      async () =>
        expect((await ws.cards.details(notes)).content).toBe(
          (await ws.cards.details(source)).content,
        ),
    ],
    [
      'Rank first',
      async () => expect((await childKeys(ws, host.key))[0]).toBe(movable),
    ],
    [
      'Move',
      async () => expect(await childKeys(ws, target)).toEqual([movable]),
    ],
    [
      'Add label demo',
      async ({ created }) => {
        expect(created).toEqual([]);
        expect((await hostMeta()).lastUpdated).toBe(lastUpdated);
      },
    ],
    [
      'Approve again',
      /does not contain state transition from state 'Approved' for 'Approve'/,
    ],
    [
      'Set a missing field',
      /field 'test\/fieldTypes\/failureMessage' is neither 'title' nor a custom field of card type 'test\/cardTypes\/allDataTypes'/,
    ],
    ['Set text into Integer', /"many" is not a valid integer value/],
    ['Set two values', /is set to two different values/],
    ['Edit locked field', /The field Field to edit of this card is locked/],
    ['Run a broken program', /^Parsing failed/],
    ['Label the template card', /is a template card/],
    [
      'Fail in program 2',
      /^Action failed in program 2: .*"many" is not a valid integer value.*\. Without autocommit, the changes of the earlier programs were kept\.$/,
    ],
  ];
  expect(buttons.map((button) => button.buttonLabel)).toEqual(
    outcomes.map(([label]) => label),
  );
  expect(before.labels).toEqual(['demo']);

  for (const [index, [label, outcome]] of outcomes.entries()) {
    const { cardKey, programs } = buttons[index];
    lastUpdated = (await hostMeta()).lastUpdated;
    const run = ws.cards.runAction(cardKey, programs);
    if (outcome instanceof RegExp) {
      await expect(run, label).rejects.toThrow(outcome);
    } else {
      await outcome(await run);
    }
  }
  // The first program of the last button was kept.
  expect((await hostMeta()).labels).toEqual(['demo', 'partial']);
});
