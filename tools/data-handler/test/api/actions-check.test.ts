// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { beforeAll, describe, expect, it } from 'vitest';

import type { Workspace } from '../../src/api/workspace.js';
import { DHValidationError } from '../../src/shared/exceptions/index.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { buildProject } from '../helpers/project-builder.js';
import {
  flow,
  metadataOf,
  readOnlyModule,
  snapshot,
} from '../domain/cards/fixture.js';

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
    [
      'setField(p_1,"title","v")',
      'setField(p_1,"title","v")',
      "card 'p_1' does not exist",
    ],
    [
      'setField("p_1","x/fieldTypes/n",-3)',
      'setField("p_1","x/fieldTypes/n",-3)',
      "card 'p_1' does not exist",
    ],
    [
      'setField(p_1,"f","4")',
      'setField(p_1,"f","4")',
      "card 'p_1' does not exist",
    ],
    ['setField(p_1,"g",x)', 'setField(p_1,"g",x)', "card 'p_1' does not exist"],
    ['rank(A,p_2)', 'rank(A,p_2)', "card 'p_2' does not exist"],
    ['rankFirst(p_1)', 'rankFirst(p_1)', "card 'p_1' does not exist"],
    [
      'setField(TPL,"title","x")',
      'setField(TPL,"title","x")',
      "card 'TPL' is a template card",
    ],
  ])('names %s as %s', async (stated, atom, reason) => {
    const error = await run(stated).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DHValidationError);
    expect((error as Error).message).toBe(
      `Cannot apply '${keys(atom)}': ${keys(reason)}`,
    );
  });

  it.each<[string, string, RegExp]>([
    ['an unknown card', 'setField(nope_1,"title","x")', /nope_1/],
    ['a template card target', 'setField(TPL,"title","x")', /template card/],
    ['a template card as rank anchor', 'rank(A,TPL)', /template card/],
    ['a template card ranked', 'rank(TPL,A)', /template card/],
    ['a template card ranked first', 'rankFirst(TPL)', /template card/],
    [
      'setField on workflowState',
      'setField(A,"workflowState","Done")',
      /workflowState/,
    ],
    ['setField on rank', 'setField(A,"rank","0|a")', /'rank' is neither/],
    [
      'setField on a field the card type lacks',
      'setField(A,"proj/fieldTypes/elsewhere","x")',
      /field 'proj\/fieldTypes\/elsewhere' is neither 'title' nor a custom field of card type 'proj\/cardTypes\/doc' \(card '.*'\)/,
    ],
    [
      'a list field',
      'setField(A,"proj/fieldTypes/many","x")',
      /list field 'proj\/fieldTypes\/many' cannot be set/,
    ],
    [
      '"abc" for a number',
      'setField(A,"proj/fieldTypes/num","abc")',
      /"abc" is not a valid number value for field 'proj\/fieldTypes\/num' of card/,
    ],
    [
      '"1.5" for an integer',
      'setField(A,"proj/fieldTypes/int","1.5")',
      /integer/,
    ],
    [
      'maybe for a boolean',
      'setField(A,"proj/fieldTypes/flag",maybe)',
      /"maybe" is not a valid boolean value/,
    ],
    [
      'a number out of range',
      'setField(A,"proj/fieldTypes/num","1e400")',
      /number/,
    ],
    [
      'an integer beyond the safe range',
      'setField(A,"proj/fieldTypes/int","123456789012345678901")',
      /integer/,
    ],
    ['"+4" for a number', 'setField(A,"proj/fieldTypes/num","+4")', /number/],
    [
      '"+4" for an integer',
      'setField(A,"proj/fieldTypes/int","+4")',
      /integer/,
    ],
    [
      'a date-time for a date',
      'setField(A,"proj/fieldTypes/day","2026-01-02T03:04:05Z")',
      /not a valid date value/,
    ],
    [
      'a date that does not exist',
      'setField(A,"proj/fieldTypes/day","2026-02-30")',
      /not a valid date value/,
    ],
    [
      'a date written another way',
      'setField(A,"proj/fieldTypes/day","2.1.2026")',
      /not a valid date value/,
    ],
    [
      'a date for a dateTime',
      'setField(A,"proj/fieldTypes/when","2026-01-02")',
      /not a valid dateTime value/,
    ],
    [
      'a dateTime without a time zone',
      'setField(A,"proj/fieldTypes/when","2026-01-02T03:04:05")',
      /not a valid dateTime value/,
    ],
    [
      'a dateTime that does not exist',
      'setField(A,"proj/fieldTypes/when","2026-01-02T25:00:00Z")',
      /not a valid dateTime value/,
    ],
    [
      'a dateTime on a day that does not exist',
      'setField(A,"proj/fieldTypes/when","2026-02-30T10:00:00Z")',
      /not a valid dateTime value/,
    ],
  ])('refuses %s', async (_case, atom, reason) => {
    const error = await run(atom).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DHValidationError);
    expect((error as Error).message).toMatch(reason);
  });

  // Every effect of the group is refused; the refusal names the first.
  it.each<[string, string[], RegExp]>([
    [
      'two values for one field',
      ['setField(A,"title","x")', 'setField(A,"title","y")'],
      /^Cannot apply 'setField\(.*,"title","x"\)': field 'title' of card '.*' is set to two different values$/,
    ],
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

  it('does not count an effect refused alone in a conflict', async () => {
    await expect(
      run(
        'setField(A,"proj/fieldTypes/num","abc")',
        'setField(A,"proj/fieldTypes/num","1")',
      ),
    ).rejects.toThrow(/"abc" is not a valid number value/);
  });

  it('wrote nothing', () => {
    expect(snapshot(path)).toEqual(before);
  });
});

// What setField writes for a value, by the data type of the field. The rows
// share one project, in order; each sets a field of B, which has a value in
// the fields a row clears. The constant null clears a field of any type.
describe('a setField value', () => {
  it.each<[string, string, string, unknown]>([
    ['true', 'boolean', 'flag', true],
    ['4', 'integer', 'int', 4],
    ['null', 'integer', 'int', undefined],
    ['"2.5"', 'number', 'num', 2.5],
    ['""', 'number', 'num', undefined],
    ['y', 'shortText', 'short', 'y'],
    ['3', 'shortText', 'short', '3'],
    ['null', 'shortText', 'short', undefined],
    ['"null"', 'shortText', 'short', 'null'],
    [
      '"2026-01-02T03:04:05.678+02:00"',
      'dateTime',
      'when',
      '2026-01-02T01:04:05.678Z',
    ],
    ['"Title"', 'title', 'title', 'Title'],
  ])('%s is written to a %s field', async (value, _dataType, name, written) => {
    const fieldName = name === 'title' ? 'title' : field(name);

    await run(`setField(B,"${fieldName}",${value})`);

    expect((await metadataOf(ws, b))[fieldName]).toEqual(written);
  });

  it('"" is written to a text field as it is', async () => {
    await run(`setField(B,"${field('short')}","")`);

    // An empty custom field has no key in the card's metadata.
    expect((await metadataOf(ws, b))[field('short')]).toBeUndefined();
  });
});
