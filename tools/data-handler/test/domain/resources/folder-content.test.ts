// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  edit,
  expectRefused,
  local,
  newParams,
  projects,
  spec,
} from './fixture.js';

const open = projects();

type Opened = Awaited<ReturnType<typeof open>>;
type Folder =
  'calculations' | 'reports' | 'graphModels' | 'graphViews' | 'skills';

const content = async (ws: Opened['ws'], name: string) =>
  (
    (await ws.resources.show(name)) as unknown as {
      content: Record<string, unknown>;
    }
  ).content;
const setContent = (
  ws: Opened['ws'],
  name: string,
  subKey: string,
  to: unknown,
) => edit(ws, name, { key: 'content', subKey }, { name: 'change', to });

describe('folder resources: editing content', () => {
  // The files that make up each type's content: property, file.
  it.each<{ type: Folder; property: string; file: string }>([
    { type: 'calculations', property: 'calculation', file: 'calculation.lp' },
    { type: 'graphModels', property: 'model', file: 'model.lp' },
    { type: 'graphViews', property: 'viewTemplate', file: 'view.lp.hbs' },
    { type: 'reports', property: 'contentTemplate', file: 'index.adoc.hbs' },
    { type: 'reports', property: 'queryTemplate', file: 'query.lp.hbs' },
    { type: 'skills', property: 'skillContent', file: 'skill.md' },
    { type: 'skills', property: 'skillQuery', file: 'query.lp' },
  ])(
    'changes the $property of a $type resource',
    async ({ type, property, file }) => {
      const { ws, path } = await open(spec);
      await ws.resources.create('x', type, newParams[type]);
      // Valid in every file: a comment.
      const text = '% changed\n';

      await setContent(ws, `test/${type}/x`, property, text);

      expect(readFileSync(local(path, type, 'x', file), 'utf-8')).toBe(text);
      expect(await content(ws, `test/${type}/x`)).toMatchObject({
        [property]: text,
      });
    },
  );

  it.each([
    { type: 'reports', name: 'x' },
    { type: 'graphViews', name: 'x' },
  ] as const)(
    'changes the parameter schema of a $type resource, from an object or from JSON text',
    async ({ type, name }) => {
      const { ws, path } = await open(spec);
      await ws.resources.create(name, type, newParams[type]);
      const target = `test/${type}/${name}`;
      const schema = {
        type: 'object',
        properties: { depth: { type: 'integer' } },
      };

      await setContent(ws, target, 'schema', schema);
      expect((await content(ws, target)).schema).toEqual(schema);

      await setContent(ws, target, 'schema', '{"type":"object"}');
      expect((await content(ws, target)).schema).toEqual({ type: 'object' });
      expect(
        JSON.parse(
          readFileSync(
            local(path, type, name, 'parameterSchema.json'),
            'utf-8',
          ),
        ),
      ).toEqual({ type: 'object' });
    },
  );

  it('adds a related tool to a skill', async () => {
    const { ws } = await open(spec);
    await ws.resources.create('x', 'skills', {});

    await edit(ws, 'test/skills/x', 'relatedTools', {
      name: 'add',
      target: 'query_cards',
    });

    expect(await ws.resources.show('test/skills/x')).toMatchObject({
      relatedTools: ['query_cards'],
    });
  });

  describe('refusals leave the project as it was', () => {
    it.each([
      {
        why: 'a calculation is not a valid logic program',
        name: 'test/calculations/calc',
        subKey: 'calculation',
        to: 'result(',
        error: /Invalid logic program for 'test\/calculations\/calc' update/,
      },
      {
        why: 'a schema is not JSON',
        name: 'test/reports/x',
        subKey: 'schema',
        to: '{not json',
        error: /Invalid JSON content for 'schema' update/,
      },
    ])('when $why', async ({ name, subKey, to, error }) => {
      const { ws, path } = await open(spec);
      await ws.resources.create('x', 'reports', {});

      await expectRefused(path, () => setContent(ws, name, subKey, to), error);
    });

    it('when the resource has no route for content', async () => {
      const { ws, path } = await open(spec);

      await expectRefused(
        path,
        () => setContent(ws, 'test/templates/tpl', 'calculation', 'x'),
        /No mutation handler/,
      );
    });

    // Pins today's behaviour: an unknown content property is a TypeError.
    it('when the property names no content file', async () => {
      const { ws, path } = await open(spec);

      await expectRefused(
        path,
        () => setContent(ws, 'test/calculations/calc', 'bogus', 'x'),
        TypeError,
      );
    });
  });

  // Pins today's behaviour: a file of another type's content is accepted and
  // written as a stray file in the folder.
  it('writes a file that belongs to another type of resource', async () => {
    const { ws, path } = await open(spec);

    await setContent(ws, 'test/calculations/calc', 'model', '% stray\n');

    expect(existsSync(local(path, 'calculations', 'calc', 'model.lp'))).toBe(
      true,
    );
  });

  // Pins today's behaviour: the module check comes after the content branch,
  // so a module's content file can be edited.
  it('edits the content file of a module resource', async () => {
    const { ws, path } = await open({
      ...spec,
      modules: [{ prefix: 'mod', calculations: { mcalc: 'a(1).\n' } }],
    });

    await setContent(ws, 'mod/calculations/mcalc', 'calculation', 'b(2).\n');

    expect(
      readFileSync(
        join(
          path,
          '.cards',
          'modules',
          'mod',
          'calculations',
          'mcalc',
          'calculation.lp',
        ),
        'utf-8',
      ),
    ).toBe('b(2).\n');
  });
});
