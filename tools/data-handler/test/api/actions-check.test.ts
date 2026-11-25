// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeAll, describe, expect, it } from 'vitest';

import type { Workspace } from '../../src/api/workspace.js';
import { DHValidationError } from '../../src/shared/exceptions/index.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { buildProject } from '../helpers/project-builder.js';
import { flow, readOnlyModule, snapshot } from '../domain/cards/fixture.js';

const field = (name: string) => `proj/fieldTypes/${name}`;

// Cards: doc a, doc b (with a value in every field), note c; a template card
// of t; a module template card.
const spec = {
  prefix: 'proj',
  workflows: [flow],
  fieldTypes: [
    { name: 'short', dataType: 'shortText' },
    { name: 'long', dataType: 'longText' },
    { name: 'who', dataType: 'person' },
    { name: 'day', dataType: 'date' },
    { name: 'when', dataType: 'dateTime' },
    { name: 'choice', dataType: 'enum', enumValues: ['x', 'y'] },
    { name: 'int', dataType: 'integer' },
    { name: 'num', dataType: 'number' },
    { name: 'flag', dataType: 'boolean' },
    { name: 'many', dataType: 'list' },
    { name: 'elsewhere', dataType: 'shortText' },
  ],
  cardTypes: [
    {
      name: 'doc',
      customFields: [
        'short',
        'long',
        'who',
        'day',
        'when',
        'choice',
        'int',
        'num',
        'flag',
        'many',
      ].map((name) => ({ name })),
    },
    { name: 'note', customFields: [{ name: 'elsewhere' }] },
  ],
  linkTypes: [
    { name: 'rel' },
    { name: 'described', enableLinkDescription: true },
    { name: 'fromNote', sourceCardTypes: ['note'] },
  ],
  cards: [
    { cardType: 'doc' },
    {
      cardType: 'doc',
      fields: {
        [field('day')]: '2020-02-02',
        [field('when')]: '2020-02-02T02:02:02.000Z',
        [field('int')]: 1,
        [field('num')]: 1.5,
        [field('flag')]: true,
      },
    },
    { cardType: 'note' },
  ],
  templates: [{ name: 't', cards: [{ cardType: 'doc' }] }],
  modules: [readOnlyModule()],
};

let ws: Workspace;
let path: string;
let a: string, b: string, c: string, tpl: string, mod: string;

beforeAll(async () => {
  const project = await buildProject(spec);
  ws = await openTestWorkspace(project.path);
  path = project.path;
  [a, b, c] = project.keys;
  [tpl] = project.templateKeys['proj/templates/t'];
  [mod] = project.templateKeys['mod/templates/mt'];
  return project.cleanup;
});

// Atoms are written with A, B, C, TPL and MOD standing for the card keys.
const keys = (atom: string) =>
  atom
    .replace(/\bTPL\b/g, tpl)
    .replace(/\bMOD\b/g, mod)
    .replace(/\bA\b/g, a)
    .replace(/\bB\b/g, b)
    .replace(/\bC\b/g, c);

// Runs one program that states the atoms as facts.
const run = (...atoms: string[]) =>
  ws.cards.runAction(a, [atoms.map((atom) => `${keys(atom)}.`).join('\n')]);

// Every row below is refused in the check, which writes nothing: one project
// serves them all, and the last test compares its files.
describe('an effect refused in the check', () => {
  let before: Record<string, string>;
  beforeAll(() => {
    before = snapshot(path);
  });

  // [the effect as the program states it, the atom the refusal names, why].
  // The atom is the effect as written, with create/2 given its Id.
  it.each<[string, string, string]>([
    ['rank(A,p_2)', 'rank(A,p_2)', "card 'p_2' does not exist"],
    ['rankFirst(p_1)', 'rankFirst(p_1)', "card 'p_1' does not exist"],
  ])('names %s as %s', async (stated, atom, reason) => {
    const error = await run(stated).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DHValidationError);
    expect((error as Error).message).toBe(
      `Cannot apply '${keys(atom)}': ${keys(reason)}`,
    );
  });

  it.each<[string, string, RegExp]>([
    ['a template card as rank anchor', 'rank(A,TPL)', /template card/],
    ['a template card ranked', 'rank(TPL,A)', /template card/],
    ['a template card ranked first', 'rankFirst(TPL)', /template card/],
  ])('refuses %s', async (_case, atom, reason) => {
    const error = await run(atom).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DHValidationError);
    expect((error as Error).message).toMatch(reason);
  });

  // Every effect of the group is refused; the refusal names the first.
  it.each<[string, string[], RegExp]>([
    [
      'rank and rankFirst of a card',
      ['rank(A,B)', 'rankFirst(A)'],
      /^Cannot apply 'rank\(.*card '.*' has more than one rank or rankFirst$/,
    ],
    [
      'two ranks of a card',
      ['rank(A,B)', 'rank(A,C)'],
      /card '.*' has more than one rank or rankFirst$/,
    ],
  ])('refuses %s', async (_case, atoms, reason) => {
    const error = await run(...atoms).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DHValidationError);
    expect((error as Error).message).toMatch(reason);
  });

  it('wrote nothing', () => {
    expect(snapshot(path)).toEqual(before);
  });
});
