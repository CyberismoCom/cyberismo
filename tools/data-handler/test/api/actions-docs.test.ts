// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// The "Action macro" docs card (docs_bfe9arl1), read from the card. Each of
// its examples is rendered from a report and its button is clicked; its
// effects table and its order of effects are compared with the definitions.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { ActionButtonOptions } from '@cyberismo/model';
import { STEPS } from '../../src/domain/actions/effects/define.js';
import { EFFECTS } from '../../src/domain/actions/effects/index.js';
import { actionButtons } from '../helpers/action-buttons.js';
import type { ProjectSpec } from '../helpers/project-builder.js';
import { childKeys, metadataOf, projects } from '../domain/cards/fixture.js';

const open = projects();

const DOCS_CARD = join(
  import.meta.dirname,
  '../../../../docs/cardRoot/docs_c81exccu/c/docs_4/c/docs_4acar03y/c/docs_bfe9arl1/index.adoc',
);

// A Windows checkout may have CRLF line endings.
const docs = readFileSync(DOCS_CARD, 'utf-8').replaceAll('\r\n', '\n');

// The fenced {{#raw}} blocks of the docs card, in order.
const blocks = [
  ...docs.matchAll(/^```\n\{\{#raw\}\}\n\n([\s\S]*?)\n\n\{\{\/raw\}\}\n```$/gm),
].map(([, block]) => block);

const [
  APPROVE,
  STEP,
  CONTROLLED_DOCUMENT,
  CHECKLIST,
  SET_CONTENT,
  RISKS_QUERY,
  RISKS,
] = blocks;

// Host, Todo, Asset 1, Asset 2, Risk 1, Risk 2. Template "other" has a card
// of every type the examples select, so an example that matched template
// cards would fail.
const spec: ProjectSpec = {
  prefix: 'mymodule',
  workflows: [
    {
      name: 'review',
      states: [
        { name: 'Draft', category: 'initial' },
        { name: 'Approved', category: 'closed' },
      ],
      transitions: [
        { name: 'Create', fromState: [], toState: 'Draft' },
        { name: 'Approve', fromState: ['Draft'], toState: 'Approved' },
      ],
    },
  ],
  fieldTypes: [
    { name: 'owner', dataType: 'shortText' },
    { name: 'step', dataType: 'shortText' },
  ],
  cardTypes: [
    { name: 'page', customFields: [{ name: 'step' }] },
    { name: 'doc' },
    { name: 'reviewTask', customFields: [{ name: 'owner' }] },
    { name: 'asset' },
    { name: 'check' },
    { name: 'risk' },
  ],
  linkTypes: [
    { name: 'implements' },
    { name: 'checks', sourceCardTypes: ['mymodule/cardTypes/check'] },
    { name: 'mitigates' },
  ],
  templates: [
    {
      name: 'controlledDocument',
      cards: [
        {
          cardType: 'doc',
          title: 'Document',
          children: [{ cardType: 'reviewTask', title: 'Review' }],
        },
      ],
    },
    { name: 'checklist', cards: [{ title: 'Checklist' }] },
    { name: 'assetCheck', cards: [{ cardType: 'check', title: 'Check' }] },
    {
      name: 'other',
      cards: [
        { title: 'Template todo', labels: ['todo'] },
        { cardType: 'asset', title: 'Template asset' },
        { cardType: 'risk', title: 'Template risk' },
      ],
    },
  ],
  reports: {
    approve: { content: APPROVE },
    step: { content: STEP },
    controlledDocument: { content: CONTROLLED_DOCUMENT },
    checklist: { content: CHECKLIST },
    setContent: { content: SET_CONTENT },
    risks: { query: RISKS_QUERY, content: RISKS },
  },
  cards: [
    { title: 'Host' },
    { title: 'Todo', labels: ['todo'] },
    { cardType: 'asset', title: 'Asset 1' },
    { cardType: 'asset', title: 'Asset 2' },
    { cardType: 'risk', title: 'Risk 1' },
    { cardType: 'risk', title: 'Risk 2' },
  ],
};

async function openProject() {
  const project = await open(spec);
  const [host, todo, asset1, asset2, risk1, risk2] = project.keys;
  const k = { host, todo, asset1, asset2, risk1, risk2 };

  // The buttons of a report shown on the host card.
  const buttons = async (
    report: string,
    parameters: Record<string, string> = {},
  ): Promise<ActionButtonOptions[]> => {
    const body = JSON.stringify({
      name: `mymodule/reports/${report}`,
      ...parameters,
    }).slice(1, -1);
    const rendered = await project.ws.render.macros(
      `{{#report}}${body}{{/report}}`,
      { cardKey: host, context: 'localApp', mode: 'inject' },
    );
    return actionButtons(rendered);
  };
  const click = ({ cardKey, programs }: ActionButtonOptions) =>
    project.ws.cards.runAction(cardKey, programs);
  const metadata = (key: string) => metadataOf(project.ws, key);
  return { ...project, k, buttons, click, metadata };
}

describe('the action macro docs examples', () => {
  it('reads every example of the docs card, in order', () => {
    expect(blocks).toHaveLength(7);
    const labels = blocks.map(
      (block) => /"buttonLabel": "([^"]*)"/.exec(block)?.[1],
    );
    expect(labels).toEqual([
      'Approve',
      'Move to step 2',
      'New controlled document',
      'New asset checklist',
      'Reset instructions',
      undefined,
      'Mitigates this',
    ]);
    expect(RISKS_QUERY).toMatch(/^select\("title"\)\./);
  });

  it('Approve transitions the card showing the report', async () => {
    const { k, buttons, click, metadata } = await openProject();

    const [button] = await buttons('approve');
    await click(button);

    expect((await metadata(k.host)).workflowState).toBe('Approved');
  });

  it('Move to step 2 sets the step of project cards labelled todo', async () => {
    const { k, buttons, click, metadata, templateKeys } = await openProject();

    const [button] = await buttons('step');
    await click(button);

    expect((await metadata(k.todo))['mymodule/fieldTypes/step']).toBe('2');
    expect(
      (await metadata(k.host))['mymodule/fieldTypes/step'],
    ).toBeUndefined();
    const [templateTodo] = templateKeys['mymodule/templates/other'];
    expect(
      (await metadata(templateTodo))['mymodule/fieldTypes/step'],
    ).toBeUndefined();
  });

  it('New controlled document creates, links and sets the owner from the report parameter', async () => {
    const { ws, k, buttons, click, metadata } = await openProject();
    const owner = 'Ann "the boss" \\ Smith';

    const [button] = await buttons('controlledDocument', { owner });
    const result = await click(button);

    expect(result.created.map((card) => card.title)).toEqual([
      'Document',
      'Review',
    ]);
    const [doc, review] = result.created.map((card) => card.key);
    expect(await childKeys(ws, k.host)).toEqual([doc]);
    expect((await metadata(doc)).links).toEqual([
      { cardKey: k.host, linkType: 'mymodule/linkTypes/implements' },
    ]);
    expect((await metadata(review))['mymodule/fieldTypes/owner']).toBe(owner);
  });

  it("New asset checklist creates one linked item per asset in the assets' tree order", async () => {
    const { ws, k, buttons, click, metadata } = await openProject();
    // Asset 2 first, so the tree order is not the creation order.
    await ws.cards.rankFirst(k.asset2);

    const [button] = await buttons('checklist');
    const result = await click(button);

    const [list] = result.created.map((card) => card.key);
    const items = await childKeys(ws, list);
    const itemData = await Promise.all(items.map((key) => metadata(key)));
    expect(itemData.map((item) => [item.title, item.links])).toEqual([
      [
        'Check: Asset 2',
        [{ cardKey: k.asset2, linkType: 'mymodule/linkTypes/checks' }],
      ],
      [
        'Check: Asset 1',
        [{ cardKey: k.asset1, linkType: 'mymodule/linkTypes/checks' }],
      ],
    ]);
  });

  it('Mitigates this shows one button per project risk, each linking its row to the host', async () => {
    const { k, buttons, click, metadata } = await openProject();

    const rows = await buttons('risks');
    expect(rows.map((row) => row.cardKey)).toEqual([k.host, k.host]);
    for (const row of rows) await click(row);

    for (const risk of [k.risk1, k.risk2]) {
      expect((await metadata(risk)).links).toEqual([
        { cardKey: k.host, linkType: 'mymodule/linkTypes/mitigates' },
      ]);
    }
  });

  it('Reset instructions replaces the content with the multi-line text', async () => {
    const { ws, k, buttons, click } = await openProject();

    const [button] = await buttons('setContent');
    await click(button);

    expect((await ws.cards.details(k.host)).content).toBe(
      '== Instructions\n\n. Read the "Security policy" card.\n. Fill in the fields of this card.',
    );
  });
});

describe('the action macro docs effects', () => {
  // The part of the docs card under a heading, up to the next heading.
  const section = (heading: string) =>
    docs.split(`=== ${heading}\n`)[1].split(/^=+ /m)[0];

  it('the effects table gives every effect with each of its forms, in the order of the definitions', () => {
    // Each effect in the first column of the table, as name/arity.
    const documented = [...section('Effects').matchAll(/^\|(`.*)$/gm)].flatMap(
      ([, cell]) =>
        [...cell.matchAll(/`(\w+)\(([^)]*)\)`/g)].map(
          ([, name, args]) => `${name}/${args.split(',').length}`,
        ),
    );

    // An effect has a form for each number of arguments it may be written
    // with: optional arguments and arguments with a default may be left out.
    const defined = EFFECTS.flatMap((kind) => {
      const args = Object.values(kind.args);
      const required = args.filter((arg) => typeof arg === 'string').length;
      return args
        .slice(required - 1)
        .map((_, index) => `${kind.name}/${required + index}`);
    });
    expect(documented).toEqual(defined);
  });

  it('the order of the effects gives every effect in the step it is applied in', () => {
    // The items of the numbered list, and the effects each names.
    const lines = [
      ...section('Order of the effects').matchAll(/^\. (.*)$/gm),
    ].map(([, line]) => line);
    const items = lines.map((line) =>
      [...line.matchAll(/`(\w+)`/g)].map(([, name]) => name),
    );

    const step = (name: string) =>
      STEPS.indexOf(EFFECTS.find((kind) => kind.name === name)!.step);
    const documented = items.flat();
    expect(documented.toSorted()).toEqual(
      EFFECTS.map((kind) => kind.name).toSorted(),
    );
    expect(documented.map(step)).toEqual(documented.map(step).toSorted());
    // An item holds one step, or names its steps in order with "then".
    const multiStep = lines.filter(
      (_, index) => new Set(items[index].map(step)).size > 1,
    );
    expect(multiStep.filter((line) => !line.includes(' then '))).toEqual([]);
  });
});
