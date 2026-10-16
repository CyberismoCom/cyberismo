// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { ResourceNotFoundError } from '../../../src/shared/exceptions/index.js';
import {
  expectRefused,
  local,
  newParams,
  projects,
  remove,
  resourceTypes,
  spec,
} from './fixture.js';

const open = projects();

describe('removing a resource', () => {
  it.each(resourceTypes)(
    'removes a %s resource, with its folder',
    async (type) => {
      const { ws, path } = await open(spec);
      await ws.resources.create('x', type, newParams[type]);

      await remove(ws, `test/${type}/x`);

      await expect(ws.resources.show(`test/${type}/x`)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      expect(existsSync(local(path, type, 'x.json'))).toBe(false);
      expect(existsSync(local(path, type, 'x'))).toBe(false);
    },
  );

  it.each([
    ['calculation', 'calculations'],
    ['cardType', 'cardTypes'],
    ['fieldType', 'fieldTypes'],
    ['graphModel', 'graphModels'],
    ['graphView', 'graphViews'],
    ['linkType', 'linkTypes'],
    ['report', 'reports'],
    ['skill', 'skills'],
    ['template', 'templates'],
    ['workflow', 'workflows'],
  ] as const)('removes a %s by its bare identifier', async (singular, type) => {
    const { ws } = await open(spec);
    await ws.resources.create('x', type, newParams[type]);

    await ws.resources.remove('x', singular);

    await expect(ws.resources.show(`test/${type}/x`)).rejects.toBeInstanceOf(
      ResourceNotFoundError,
    );
  });

  it('is one commit under autocommit, subject Remove <type> <name>', async () => {
    const { ws, path } = await open(
      { ...spec, git: true },
      { autocommit: true },
    );
    await ws.resources.create('x', 'workflows', newParams.workflows);

    await ws.resources.remove('x', 'workflow');

    expect(
      (
        await promisify(execFile)('git', ['log', '-1', '--format=%s'], {
          cwd: path,
        })
      ).stdout.trim(),
    ).toBe('Remove workflow x');
  });

  it('is not stopped by a resource that names it, which is left as it is', async () => {
    const { ws, keys } = await open({
      ...spec,
      cards: [{ content: 'Built on test/templates/tpl.' }],
    });

    await remove(ws, 'test/templates/tpl');

    expect((await ws.cards.details(keys[0])).content).toBe(
      'Built on test/templates/tpl.',
    );
  });

  describe('refusals leave the project as it was', () => {
    it.each(resourceTypes)(
      'when the %s resource does not exist',
      async (type) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () => remove(ws, `test/${type}/missing`),
          ResourceNotFoundError,
        );
      },
    );

    it.each([
      ['workflows', 'mflow'],
      ['cardTypes', 'mtype'],
      ['fieldTypes', 'mfield'],
      ['linkTypes', 'mlink'],
      ['templates', 'mtpl'],
      ['calculations', 'mcalc'],
    ])("when the %s resource is a module's", async (type, id) => {
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

      await expectRefused(
        path,
        () => remove(ws, `mod/${type}/${id}`),
        /module resource/,
      );
    });
  });
});
