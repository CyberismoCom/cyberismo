// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ResourceNotFoundError } from '../../../src/shared/exceptions/index.js';
import {
  edit,
  expectRefused,
  local,
  newParams,
  projects,
  readJson,
  rename,
  snapshot,
  spec,
} from './fixture.js';

const open = projects();

const leafTypes = [
  'templates',
  'calculations',
  'reports',
  'graphModels',
  'graphViews',
  'skills',
] as const;

describe('renaming leaf resources', () => {
  it.each(leafTypes)(
    'moves a %s resource, with its folder, to the new name',
    async (type) => {
      const { ws, path } = await open(spec);
      await ws.resources.create('x', type, newParams[type]);
      const folder = local(path, type, 'x');
      const files = readdirSync(folder).sort();
      const shown = await ws.resources.show(`test/${type}/x`);

      await rename(ws, `test/${type}/x`, 'y');

      expect(await ws.resources.show(`test/${type}/y`)).toEqual({
        ...shown,
        name: `test/${type}/y`,
        ...('path' in shown ? { path: local(path, type, 'y.json') } : {}),
      });
      await expect(ws.resources.show(`test/${type}/x`)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      expect(readJson(local(path, type, 'y.json'))).toMatchObject({
        name: `test/${type}/y`,
      });
      expect(readdirSync(local(path, type, 'y')).sort()).toEqual(files);
      expect(existsSync(local(path, type, 'x.json'))).toBe(false);
      expect(existsSync(folder)).toBe(false);
    },
  );

  it('moves the cards of a template with it', async () => {
    const { ws, templateKeys, path } = await open(spec);
    const [key] = templateKeys['test/templates/tpl'];

    await rename(ws, 'test/templates/tpl', 'blueprint');

    expect(await ws.resources.show('test/templates/blueprint')).toMatchObject({
      numberOfCards: 1,
    });
    expect(
      existsSync(local(path, 'templates', 'blueprint', 'c', key, 'index.json')),
    ).toBe(true);
    const [card] = await ws.cards.create('test/templates/blueprint');
    expect((await ws.cards.details(card.key)).metadata?.title).toBe('T1');
  });

  describe('rewrites the references to it', () => {
    const refs = (type: string) => `see test/${type}/x and more`;

    it.each(leafTypes)(
      'in card content and in the content files of calculations and reports (%s)',
      async (type) => {
        const { ws, keys } = await open({
          ...spec,
          cards: [{ content: refs(type) }],
        });
        await ws.resources.create('x', type, newParams[type]);
        await ws.resources.create('c', 'calculations', {});
        await ws.resources.create('r', 'reports', {});
        await edit(
          ws,
          'test/calculations/c',
          { key: 'content', subKey: 'calculation' },
          { name: 'change', to: `% ${refs(type)}\n` },
        );
        await edit(
          ws,
          'test/reports/r',
          { key: 'content', subKey: 'contentTemplate' },
          { name: 'change', to: refs(type) },
        );

        await rename(ws, `test/${type}/x`, 'y');

        const renamed = `see test/${type}/y and more`;
        expect((await ws.cards.details(keys[0])).content).toBe(renamed);
        expect(
          (
            (await ws.resources.show('test/calculations/c')) as {
              content: { calculation: string };
            }
          ).content.calculation,
        ).toBe(`% ${renamed}\n`);
        expect(
          (
            (await ws.resources.show('test/reports/r')) as {
              content: { contentTemplate: string };
            }
          ).content.contentTemplate,
        ).toBe(renamed);
      },
    );

    // Pins today's behaviour: skill content is not among the files rewritten.
    it('but not in the content of skills', async () => {
      const { ws } = await open(spec);
      await ws.resources.create('x', 'reports', {});
      await ws.resources.create('k', 'skills', {});
      await edit(
        ws,
        'test/skills/k',
        { key: 'content', subKey: 'skillContent' },
        { name: 'change', to: 'use test/reports/x' },
      );

      await rename(ws, 'test/reports/x', 'y');

      expect(
        (
          (await ws.resources.show('test/skills/k')) as {
            content: { skillContent: string };
          }
        ).content.skillContent,
      ).toBe('use test/reports/x');
    });
  });
});

describe('renaming through an edit of the name', () => {
  // Pins today's behaviour: the prefix of the new name is not checked.
  it('is the same as a rename, whatever prefix the new name carries', async () => {
    const { ws } = await open(spec);

    await edit(ws, 'test/workflows/other', 'name', {
      name: 'change',
      to: 'elsewhere/workflows/second',
    });

    expect(await ws.resources.show('test/workflows/second')).toMatchObject({
      name: 'test/workflows/second',
    });
    await expect(
      ws.resources.show('test/workflows/other'),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
  });
});

describe('refusing a rename', () => {
  it.each([
    {
      why: 'the resource does not exist',
      name: 'test/calculations/missing',
      to: 'y',
      error: ResourceNotFoundError,
    },
    {
      why: 'the new identifier has a space',
      name: 'test/workflows/flow',
      to: 'no spaces',
      error: /naming rules/,
    },
    {
      why: 'the new identifier is empty',
      name: 'test/fieldTypes/spare',
      to: '',
      error: /Identifier is missing/,
    },
    {
      // Pins today's behaviour: the new name is not checked to be free, so the
      // refusal comes from the file system.
      why: 'the folder of the new name is taken',
      name: 'test/calculations/calc',
      to: 'taken',
      error: /ENOTEMPTY|EEXIST|EPERM/,
    },
    ...[
      ['workflows', 'mflow'],
      ['cardTypes', 'mtype'],
      ['fieldTypes', 'mfield'],
      ['linkTypes', 'mlink'],
      ['templates', 'mtpl'],
      ['calculations', 'mcalc'],
    ].map(([type, id]) => ({
      why: `the ${type} resource is a module's`,
      name: `mod/${type}/${id}`,
      to: 'y',
      error: /module resource/,
    })),
  ])('when $why, changing nothing', async ({ name, to, error }) => {
    const { ws, path } = await open({
      ...spec,
      modules: [
        {
          prefix: 'mod',
          workflows: [{ name: 'mflow' }],
          cardTypes: [{ name: 'mtype' }],
          fieldTypes: [{ name: 'mfield', dataType: 'integer' }],
          linkTypes: [{ name: 'mlink' }],
          templates: [{ name: 'mtpl' }],
          calculations: { mcalc: 'a(1).\n' },
        },
      ],
    });
    await ws.resources.create('taken', 'calculations', {});

    await expectRefused(path, () => rename(ws, name, to), error);
  });

  describe('when the new identifier is invalid, after the cascade has run', () => {
    // Pins today's behaviour: these handlers rewrite the references before
    // the identifier is checked, so without a rollback they are left rewritten.
    it.each([
      'test/cardTypes/page',
      'test/linkTypes/rel',
      'test/templates/tpl',
    ])('leaves the references to %s rewritten', async (name) => {
      const { ws, path } = await open(spec);
      const before = snapshot(path);

      await expect(rename(ws, name, 'no spaces')).rejects.toThrow(
        /naming rules/,
      );

      expect(snapshot(path)).not.toEqual(before);
    });

    it.each([
      'test/cardTypes/page',
      'test/linkTypes/rel',
      'test/templates/tpl',
    ])('leaves nothing behind under autocommit: %s', async (name) => {
      const { ws, path } = await open(
        { ...spec, git: true },
        { autocommit: true },
      );
      const before = snapshot(path);

      await expect(rename(ws, name, 'no spaces')).rejects.toThrow(
        /naming rules/,
      );

      expect(snapshot(path)).toEqual(before);
    });
  });

  // Pins today's behaviour: the new name is not checked to be free, so a file
  // resource of that name is overwritten and its references are merged.
  it.each([
    ['test/workflows/flow', 'other', 'workflows'],
    ['test/cardTypes/page', 'bare', 'cardTypes'],
    ['test/fieldTypes/spare', 'size', 'fieldTypes'],
  ])(
    'overwrites the file resource that has the new name: %s to %s',
    async (name, to, type) => {
      const { ws, path } = await open(spec);
      const moved = readJson(local(path, type, `${name.split('/')[2]}.json`));

      await rename(ws, name, to);

      expect(readJson(local(path, type, `${to}.json`))).toMatchObject({
        ...moved,
        name: `test/${type}/${to}`,
      });
    },
  );
});
