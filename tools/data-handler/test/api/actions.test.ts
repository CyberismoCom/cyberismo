// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import type { ActionResult } from '@cyberismo/model';
import type { Workspace } from '../../src/api/workspace.js';
import {
  LogicInvalidError,
  LogicNonTotalError,
} from '../../src/infra/logic/logic-backend.js';
import {
  CardNotFoundError,
  DHValidationError,
} from '../../src/shared/exceptions/index.js';
import type { ProjectSpec } from '../helpers/project-builder.js';
import {
  expectRefused,
  flow,
  projects,
  rootKeys,
  snapshot,
} from '../domain/cards/fixture.js';

const open = projects();

const field = (name: string) => `proj/fieldTypes/${name}`;
// Project cards A (with child A1), Req, B, C, Asset 1 and Asset 2. Every card
// type a program selects also has a card in template t, so a selector that
// forgets projectCard reaches a template card. Module mod has a catalogue of
// three controls.
const spec: ProjectSpec = {
  prefix: 'proj',
  workflows: [flow],
  fieldTypes: [
    { name: 'owner', dataType: 'shortText' },
    { name: 'scope', dataType: 'shortText' },
    { name: 'step', dataType: 'shortText' },
    { name: 'flag', dataType: 'boolean' },
    { name: 'size', dataType: 'number' },
    { name: 'tags', dataType: 'list' },
  ],
  cardTypes: [
    {
      name: 'page',
      customFields: ['owner', 'scope', 'step', 'flag', 'size', 'tags'].map(
        (name) => ({ name }),
      ),
    },
    { name: 'doc' },
    { name: 'reviewTask', customFields: [{ name: 'owner' }] },
    { name: 'asset' },
    { name: 'check' },
  ],
  linkTypes: [
    { name: 'implements' },
    { name: 'relates', enableLinkDescription: true },
    { name: 'checks', sourceCardTypes: ['proj/cardTypes/check'] },
  ],
  templates: [
    {
      name: 'doc',
      cards: [
        {
          cardType: 'doc',
          title: 'Document',
          children: [{ cardType: 'reviewTask', title: 'Review' }],
        },
      ],
    },
    { name: 'adopt', cards: [{ title: 'Adopted' }] },
    { name: 'checklist', cards: [{ title: 'Checklist' }] },
    { name: 'assetCheck', cards: [{ cardType: 'check', title: 'Check' }] },
    {
      name: 't',
      cards: [
        { title: 'New', labels: ['todo'] },
        { cardType: 'asset', title: 'Template asset' },
      ],
    },
  ],
  modules: [
    {
      prefix: 'mod',
      workflows: [{ name: 'flow' }],
      cardTypes: [{ name: 'control' }],
      templates: [
        {
          name: 'catalogue',
          cards: [{ title: 'C1' }, { title: 'C2' }, { title: 'C3' }],
        },
      ],
    },
  ],
  cards: [
    { title: 'A', children: [{ title: 'A1' }] },
    { title: 'Req' },
    {
      title: 'B',
      labels: ['todo'],
      fields: { [field('flag')]: true, [field('size')]: 1.5 },
      links: [{ linkType: 'implements', to: 2 }],
    },
    {
      title: 'C',
      labels: ['todo', 'x'],
      content: 'Hello',
      links: [{ linkType: 'relates', to: 2, linkDescription: 'd' }],
    },
    { cardType: 'asset', title: 'Asset 1' },
    { cardType: 'asset', title: 'Asset 2' },
  ],
};

type Keys = Record<
  'A' | 'A1' | 'req' | 'B' | 'C' | 'asset1' | 'asset2',
  string
>;

async function openProject(
  options: { autocommit?: boolean; calculations?: Record<string, string> } = {},
) {
  const project = await open(
    {
      ...spec,
      calculations: options.calculations,
      git: options.autocommit,
    },
    { autocommit: options.autocommit },
  );
  const [A, A1, req, B, C, asset1, asset2] = project.keys;
  const keys: Keys = { A, A1, req, B, C, asset1, asset2 };
  const run = (...programs: string[]) =>
    project.ws.cards.runAction(A, programs);
  const git = async (...args: string[]) =>
    (await promisify(execFile)('git', args, { cwd: project.path })).stdout;
  return { ...project, k: keys, run, git };
}

describe('runAction', () => {
  it.each<
    [
      string,
      (k: Keys) => string,
      (ws: Workspace, k: Keys, result: ActionResult) => Promise<void>,
    ]
  >([
    [
      'rank',
      (k) => `rank(${k.B}, ${k.C}).`,
      async (ws, k) => {
        expect(await rootKeys(ws)).toEqual([
          k.A,
          k.req,
          k.C,
          k.B,
          k.asset1,
          k.asset2,
        ]);
      },
    ],
    [
      'rankFirst',
      (k) => `rankFirst(${k.C}).`,
      async (ws, k) => {
        expect((await rootKeys(ws))[0]).toBe(k.C);
      },
    ],
  ])('applies %s', async (_, program, expectation) => {
    const { ws, k, run } = await openProject();

    const result = await run(program(k));

    await expectation(ws, k, result);
  });

  it('gives the action card as actionCard/1', async () => {
    const { ws, k } = await openProject();

    await ws.cards.runAction(k.C, ['rankFirst(C) :- actionCard(C).']);

    expect((await rootKeys(ws))[0]).toBe(k.C);
  });

  it("a #program in a program switches off only the program's later rules", async () => {
    const { ws, k, run } = await openProject();

    await run(
      `rank(C, ${k.B}) :- actionCard(C), projectCard(C).\n#program other.\nrankFirst(${k.C}).`,
    );

    expect((await rootKeys(ws)).slice(0, 4)).toEqual([k.req, k.B, k.A, k.C]);
  });

  it.each<[string, (k: Keys, t: string, m: string) => string | undefined]>([
    ['two ranks of a card', (k) => `rankFirst(${k.B}). rank(${k.B}, ${k.C}).`],
    ['an empty programs array', () => undefined],
  ])(
    'refuses %s in the first program and writes nothing',
    async (_, program) => {
      const { ws, k, path, templateKeys } = await openProject();
      const [t] = templateKeys['proj/templates/t'];
      const [m] = templateKeys['mod/templates/catalogue'];
      const text = program(k, t, m);

    await expectRefused(
      path,
      () => ws.cards.runAction(k.A, []),
      DHValidationError,
    );
  });

  it.each<[string, new (...args: never[]) => Error]>([
    ['#include "f.lp".', LogicInvalidError],
    ['#script (lua) #end.', LogicInvalidError],
    [':- actionCard(_).', LogicNonTotalError],
    ['rankFirst(C :- actionCard(C).', LogicInvalidError],
    ['queryError("a", "b").', LogicInvalidError],
  ])(
    'fails %s with the logic error unchanged and writes nothing',
    async (program, error) => {
      const { run, path } = await openProject();

      await expectRefused(path, () => run(program), error);
    },
  );

  it('refuses an unknown card key', async () => {
    const { ws } = await openProject();

    await expect(
      ws.cards.runAction('proj_nope', ['rankFirst(C) :- actionCard(C).']),
    ).rejects.toThrow(CardNotFoundError);
  });

  it.each([
    ['a misspelled effect name', 'addLable(C, "x") :- actionCard(C).'],
    ['a wrong argument count', 'rankFirst(C, 1) :- actionCard(C).'],
    ['an effect name in another case', 'rankfirst(C) :- actionCard(C).'],
    ['a result of its own', 'result(x).'],
    ['a nested term', 'helper(f(1)).'],
  ])('does nothing for %s', async (_, program) => {
    const { run, path } = await openProject();
    const before = snapshot(path);

    const result = await run(program);

    expect(result).toEqual({ created: [] });
    expect(snapshot(path)).toEqual(before);
  });
});
