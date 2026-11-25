// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import type { ActionResult } from '@cyberismo/model';
import type { Workspace } from '../../src/api/workspace.js';
import {
  LogicInvalidError,
  LogicNonTotalError,
} from '../../src/infra/logic/logic-backend.js';
import {
  ActionFailedError,
  CardNotFoundError,
  DHValidationError,
} from '../../src/shared/exceptions/index.js';
import type { ProjectSpec } from '../helpers/project-builder.js';
import {
  childKeys,
  expectRefused,
  flow,
  metadataOf,
  projects,
  rootKeys,
  snapshot,
} from '../domain/cards/fixture.js';

const open = projects();

const field = (name: string) => `proj/fieldTypes/${name}`;
const linkType = (name: string) => `proj/linkTypes/${name}`;

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
      'setField on the title',
      (k) => `setField(${k.B}, "title", "Renamed").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.B)).title).toBe('Renamed');
      },
    ],
    [
      'setField on a custom field',
      (k) => `setField(${k.B}, "${field('size')}", "2.5").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.B))[field('size')]).toBe(2.5);
      },
    ],
    [
      'setField with "" to clear a number field',
      (k) => `setField(${k.B}, "${field('size')}", "").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.B))[field('size')]).toBeUndefined();
      },
    ],
    [
      'setContent',
      (k) => `setContent(${k.B}, "New text").`,
      async (ws, k) => {
        expect((await ws.cards.details(k.B)).content).toBe('New text');
      },
    ],
    [
      'copyContent',
      (k) => `copyContent(${k.B}, ${k.C}).`,
      async (ws, k) => {
        expect((await ws.cards.details(k.B)).content).toBe('Hello');
      },
    ],
    [
      'addLabel',
      (k) => `addLabel(${k.A}, "new").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.A)).labels).toEqual(['new']);
      },
    ],
    [
      'removeLabel',
      (k) => `removeLabel(${k.C}, "x").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.C)).labels).toEqual(['todo']);
      },
    ],
    [
      'addLink/3',
      (k) => `addLink(${k.A}, ${k.req}, "${linkType('implements')}").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.A)).links).toEqual([
          { cardKey: k.req, linkType: linkType('implements') },
        ]);
      },
    ],
    [
      'addLink/4',
      (k) => `addLink(${k.A}, ${k.req}, "${linkType('relates')}", "why").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.A)).links).toEqual([
          {
            cardKey: k.req,
            linkType: linkType('relates'),
            linkDescription: 'why',
          },
        ]);
      },
    ],
    [
      'addLink/4 with commas and parentheses in the description',
      (k) =>
        `addLink(${k.A}, ${k.req}, "${linkType('relates')}", "a, (b), c").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.A)).links).toEqual([
          {
            cardKey: k.req,
            linkType: linkType('relates'),
            linkDescription: 'a, (b), c',
          },
        ]);
      },
    ],
    [
      'removeLink/3',
      (k) => `removeLink(${k.B}, ${k.req}, "${linkType('implements')}").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.B)).links).toEqual([]);
      },
    ],
    [
      'removeLink/4',
      (k) => `removeLink(${k.C}, ${k.req}, "${linkType('relates')}", "d").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.C)).links).toEqual([]);
      },
    ],
    [
      'transition',
      (k) => `transition(${k.B}, "Start").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.B)).workflowState).toBe('Review');
      },
    ],
    [
      'move to a card',
      (k) => `move(${k.B}, ${k.A}).`,
      async (ws, k) => {
        expect(await childKeys(ws, k.A)).toEqual([k.A1, k.B]);
      },
    ],
    [
      'move to root',
      (k) => `move(${k.A1}, root).`,
      async (ws, k) => {
        expect(await rootKeys(ws)).toContain(k.A1);
        expect(await childKeys(ws, k.A)).toEqual([]);
      },
    ],
    [
      'setContent of a number as its digits',
      (k) => `setContent(${k.B}, 3).`,
      async (ws, k) => {
        expect((await ws.cards.details(k.B)).content).toBe('3');
      },
    ],
    [
      'the same content written two ways as one effect',
      (k) => `setContent(${k.B}, "x"). setContent("${k.B}", "x").`,
      async (ws, k) => {
        expect((await ws.cards.details(k.B)).content).toBe('x');
      },
    ],
    [
      'one field value written as an integer and as a string',
      (k) =>
        `setField(${k.B}, "${field('size')}", 4). setField(${k.B}, "${field('size')}", "4").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.B))[field('size')]).toBe(4);
      },
    ],
    [
      'one field value written as a constant and as a string',
      (k) =>
        `setField(${k.B}, "${field('owner')}", x). setField(${k.B}, "${field('owner')}", "x").`,
      async (ws, k) => {
        expect((await metadataOf(ws, k.B))[field('owner')]).toBe('x');
      },
    ],
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

  it('copies the content of a template card', async () => {
    const { ws, k, run, templateKeys } = await openProject();
    const [templateCard] = templateKeys['proj/templates/t'];

    await run(`copyContent(${k.C}, ${templateCard}).`);

    expect((await ws.cards.details(k.C)).content).toBe('');
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

  it('transitions the action card', async () => {
    const { ws, k, run } = await openProject();

    await run('transition(C, "Start") :- actionCard(C).');

    expect((await metadataOf(ws, k.A)).workflowState).toBe('Review');
  });

  it('sets a field on every matching card', async () => {
    const { ws, k, run, templateKeys } = await openProject();

    await run(
      `setField(C, "${field('step')}", "2") :- projectCard(C), label(C, "todo").`,
    );

    expect((await metadataOf(ws, k.B))[field('step')]).toBe('2');
    expect((await metadataOf(ws, k.C))[field('step')]).toBe('2');
    expect((await metadataOf(ws, k.A))[field('step')]).toBeUndefined();
    const [templateCard] = templateKeys['proj/templates/t'];
    expect((await metadataOf(ws, templateCard))[field('step')]).toBeUndefined();
  });

  it('program 2 sees a field set by program 1', async () => {
    const { ws, k, run } = await openProject();

    await run(
      'setField(C, "title", "Seen") :- actionCard(C).',
      'addLabel(C, "seen") :- actionCard(C), field(C, "title", "Seen").',
    );

    expect((await metadataOf(ws, k.A)).labels).toEqual(['seen']);
  });

  it('the transition guard sees a field set in the same program', async () => {
    const { ws, k, run } = await openProject({
      calculations: {
        guard: `transitionDenied(C, "Start", "not flagged") :- projectCard(C), not field(C, "${field('flag')}", "true").`,
      },
    });
    const program = (setFlag: boolean) =>
      `${setFlag ? `setField(C, "${field('flag')}", true) :- actionCard(C).` : ''}
       transition(C, "Start") :- actionCard(C).`;

    await expect(run(program(false))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await run(program(true));

    expect((await metadataOf(ws, k.A)).workflowState).toBe('Review');
  });

  it('allows a second transition of a card in a later program', async () => {
    const { ws, k, run } = await openProject();

    await run(
      'transition(C, "Start") :- actionCard(C).',
      'transition(C, "Finish") :- actionCard(C).',
    );

    expect((await metadataOf(ws, k.A)).workflowState).toBe('Done');
  });

  it('copies a boolean and a number field with setField(K,F,V) :- field(A,F,V)', async () => {
    const { ws, k, run } = await openProject();

    await run(
      `setField(K, F, V) :- actionCard(K), field(${k.B}, F, V), F = "${field('flag')}".
       setField(K, F, V) :- actionCard(K), field(${k.B}, F, V), F = "${field('size')}".`,
    );

    const metadata = await metadataOf(ws, k.A);
    expect(metadata[field('flag')]).toBe(true);
    expect(metadata[field('size')]).toBe(1.5);
  });

  it.each<[string, (k: Keys, t: string, m: string) => string | undefined]>([
    ['an unknown card', () => 'addLabel(proj_nope, "x").'],
    ['a template card target', (_, t) => `addLabel(${t}, "x").`],
    ['a module card target', (_, __, m) => `addLabel(${m}, "x").`],
    [
      'an unknown link type',
      (k) => `addLink(${k.A}, ${k.req}, "proj/linkTypes/nope").`,
    ],
    [
      'a link description the link type does not allow',
      (k) => `addLink(${k.A}, ${k.req}, "${linkType('implements')}", "d").`,
    ],
    [
      'a card type the link type does not allow',
      (k) => `addLink(${k.A}, ${k.req}, "${linkType('checks')}").`,
    ],
    [
      'a link both added and removed',
      (k) =>
        `addLink(${k.A}, ${k.req}, "${linkType('implements')}"). removeLink(${k.A}, ${k.req}, "${linkType('implements')}").`,
    ],
    [
      'an external link item',
      (k) => `addLink(${k.A}, "jira:X-1", "${linkType('implements')}").`,
    ],
    [
      'setField on workflowState',
      (k) => `setField(${k.A}, "workflowState", "Done").`,
    ],
    ['setField on rank', (k) => `setField(${k.A}, "rank", "0|a").`],
    [
      "setField on a field the card's type lacks",
      (k) => `setField(${k.asset1}, "${field('owner')}", "x").`,
    ],
    [
      'setField on a list field',
      (k) => `setField(${k.A}, "${field('tags')}", "x").`,
    ],
    [
      'a value that is not a number',
      (k) => `setField(${k.A}, "${field('size')}", "abc").`,
    ],
    [
      'a value that is not a boolean',
      (k) => `setField(${k.A}, "${field('flag')}", maybe).`,
    ],
    [
      'two values for one field',
      (k) => `setField(${k.A}, "title", "x"). setField(${k.A}, "title", "y").`,
    ],
    [
      'two moves of a card',
      (k) => `move(${k.B}, ${k.A}). move(${k.B}, ${k.C}).`,
    ],
    ['two ranks of a card', (k) => `rankFirst(${k.B}). rank(${k.B}, ${k.C}).`],
    [
      'two transitions of a card',
      (k) => `transition(${k.B}, "Start"). transition(${k.B}, "Close").`,
    ],
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

  it.each<[string, (k: Keys) => string[], RegExp, string]>([
    [
      'an execution failure in program 1',
      (k) => [`addLabel(${k.A}, "x"). transition(${k.A}, "Finish").`],
      /^Action failed in program 1 at transition\(/,
      'validation',
    ],
    [
      'a check refusal in program 2',
      (k) => [
        `addLabel(${k.A}, "x").`,
        `setField(${k.A}, "workflowState", "Done").`,
      ],
      /^Action failed in program 2: Cannot apply 'setField\(/,
      'validation',
    ],
    [
      'a logic-non-total error in program 2',
      (k) => [`addLabel(${k.A}, "x").`, ':- actionCard(_).'],
      /^Action failed in program 2: /,
      'logic-non-total',
    ],
  ])(
    'rolls back a failed click under autocommit: %s',
    async (_, programs, message, code) => {
      const { ws, k, path, git } = await openProject({ autocommit: true });
      const before = snapshot(path);
      const log = await git('log', '--format=%H');

      const error = await ws.cards
        .runAction(k.A, programs(k))
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ActionFailedError);
      expect((error as ActionFailedError).message).toMatch(message);
      expect((error as ActionFailedError).code).toBe(code);
      expect(snapshot(path)).toEqual(before);
      expect(await git('log', '--format=%H')).toBe(log);
      expect((await metadataOf(ws, k.A)).labels).toEqual([]);
    },
  );

  it('without autocommit, stops at the first failure, keeps what was applied and says so', async () => {
    const { ws, k, run } = await openProject();

    const error = await run(
      `addLabel(${k.A}, "one"). addLabel(${k.B}, "two").`,
      `addLabel(${k.C}, "three"). transition(${k.A}, "Finish"). rankFirst(${k.C}).`,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ActionFailedError);
    expect((error as Error).message).toBe(
      `Action failed in program 2 at transition(${k.A},"Finish"): ` +
        `Card's workflow 'proj/workflows/flow' does not contain state transition from state 'Open' for 'Finish'. ` +
        'Without autocommit, the changes of the earlier programs were kept.',
    );
    expect((await metadataOf(ws, k.A)).labels).toEqual(['one']);
    expect((await metadataOf(ws, k.B)).labels).toEqual(['todo', 'two']);
    expect((await metadataOf(ws, k.C)).labels).toEqual(['todo', 'x', 'three']);
    expect((await rootKeys(ws))[0]).toBe(k.A);
  });

  it('does not say that anything was kept when program 1 fails', async () => {
    const { k, run } = await openProject();

    const error = await run(
      `addLabel(${k.A}, "one"). transition(${k.A}, "Finish").`,
    ).catch((e: unknown) => e);

    expect((error as Error).message).toBe(
      `Action failed in program 1 at transition(${k.A},"Finish"): ` +
        `Card's workflow 'proj/workflows/flow' does not contain state transition from state 'Open' for 'Finish'.`,
    );
  });

  // removeLabel of a label the card lacks: B has only another label, A has
  // none, C has several.
  it('skips effects already in place', async () => {
    const { k, run, path } = await openProject();
    const before = snapshot(path);

    // The transition at the end fails, so the error names it; nothing before
    // it is written.
    const error = await run(
      `addLabel(${k.C}, "todo").
       removeLabel(${k.B}, "x").
       removeLabel(${k.A}, "x").
       removeLabel(${k.C}, "y").
       copyContent(${k.A}, ${k.A1}).
       addLink(${k.B}, ${k.req}, "${linkType('implements')}").
       removeLink(${k.C}, ${k.req}, "${linkType('relates')}").
       setField(${k.B}, "title", "B").
       setField(${k.B}, "${field('size')}", "1.5").
       setField(${k.A}, "${field('size')}", "").
       move(${k.A1}, ${k.A}).
       transition(${k.A}, "Finish").`,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ActionFailedError);
    expect((error as ActionFailedError).details).toMatchObject({
      program: 1,
      effect: `transition(${k.A},"Finish")`,
    });
    expect(snapshot(path)).toEqual(before);
  });

  it('program 2 sees a rank set by program 1', async () => {
    const { ws, k, run } = await openProject();

    await run(
      `rankFirst(${k.C}).`,
      `addLabel(${k.C}, "first") :- field(${k.C}, "rank", RC), field(${k.A}, "rank", RA), RC < RA.`,
    );

    expect((await metadataOf(ws, k.C)).labels).toContain('first');
  });

  it.each<[string, (k: Keys) => string]>([
    ['copyContent', (k) => `copyContent(${k.A},${k.C})`],
    ['setContent', (k) => `setContent(${k.A},"x")`],
  ])(
    'a content guard sees a label added earlier in the same program: %s',
    async (_, effect) => {
      const { ws, k, run } = await openProject({
        calculations: {
          guard:
            'editingContentDenied(C, "frozen") :- projectCard(C), label(C, "frozen").',
        },
      });

      const error = await run(
        `addLabel(${k.A}, "frozen"). ${effect(k)}.`,
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ActionFailedError);
      expect((error as ActionFailedError).code).toBe('permission-denied');
      expect((error as ActionFailedError).details?.effect).toBe(effect(k));
      expect((await ws.cards.details(k.A)).content).toBe('');
    },
  );

  it('writes setContent text exactly, over several lines', async () => {
    const { k, run, path } = await openProject();

    // Clingo string escapes: \n, \" and \\.
    await run(String.raw`setContent(${k.B}, "line 1\nsay \"hi\"\nC:\\path").`);

    expect(
      readFileSync(join(path, 'cardRoot', k.B, 'index.adoc'), 'utf-8'),
    ).toBe('line 1\nsay "hi"\nC:\\path');
  });

  it('skips a setContent with the content the card has', async () => {
    const { k, run, path } = await openProject();
    const before = snapshot(path);

    const error = await run(
      `setContent(${k.C}, "Hello"). transition(${k.A}, "Finish").`,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ActionFailedError);
    expect(snapshot(path)).toEqual(before);
  });

  it.each([
    ['a misspelled effect name', 'addLable(C, "x") :- actionCard(C).'],
    ['a wrong argument count', 'rankFirst(C, 1) :- actionCard(C).'],
    ['an effect name in another case', 'rankfirst(C) :- actionCard(C).'],
    ['setField/2', 'setField(C, "title") :- actionCard(C).'],
    ['a result of its own', 'result(x).'],
    ['a nested term', 'helper(f(1)).'],
  ])('does nothing for %s', async (_, program) => {
    const { run, path } = await openProject();
    const before = snapshot(path);

    const result = await run(program);

    expect(result).toEqual({ created: [] });
    expect(snapshot(path)).toEqual(before);
  });

  it('names the first refused effect in atom order', async () => {
    const { run } = await openProject();

    await expect(
      run('rankFirst(b). addLabel(b, "x"). rank(a, b).'),
    ).rejects.toThrow(
      `Cannot apply 'addLabel(b,"x")': card 'b' does not exist`,
    );
  });

  it('keeps effects apart whose arguments concatenate the same', async () => {
    const { k, run } = await openProject();

    await expect(
      run(
        `addLink(${k.A}, ${k.A}, "ab", "c"). addLink(${k.A}, ${k.A}, "a", "bc").`,
      ),
    ).rejects.toThrow(
      `Cannot apply 'addLink(${k.A},${k.A},"a","bc")': link type 'a' does not exist`,
    );
  });
});
