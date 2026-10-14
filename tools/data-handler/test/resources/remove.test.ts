/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { ResourceNotFoundError } from '../../src/exceptions/index.js';
import { removeResource } from '../../src/utils/remove-resource.js';
import {
  expectRefused,
  local,
  newParams,
  projects,
  remove,
  resourceTypes,
  spec,
} from './fixture.js';
import { Remove } from '../../src/commands/remove.js';

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

    await removeResource(ws, singular, 'x');

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

    await removeResource(ws, 'workflow', 'x');

    expect(
      (
        await promisify(execFile)('git', ['log', '-1', '--format=%s'], {
          cwd: path,
        })
      ).stdout.trim(),
    ).toBe('Remove workflow x');
  });

  it('refuses a type the remove command does not know, changing nothing', async () => {
    const { ws, path } = await open(spec);

    await expectRefused(
      path,
      () => new Remove(ws).remove('colour' as never, 'x'),
      /Unknown resource type 'colour'/,
    );
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
