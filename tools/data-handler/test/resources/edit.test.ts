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

import { describe, expect, it } from 'vitest';

import { ResourceNotFoundError } from '../../src/shared/exceptions/index.js';
import {
  edit,
  expectRefused,
  local,
  newParams,
  projects,
  readJson,
  spec,
} from './fixture.js';

const open = projects();

describe('changes.apply: editing a resource', () => {
  // One handler serves every type; a file, a folder and a template show it.
  it.each(['fieldTypes', 'calculations', 'templates'] as const)(
    'changes the display name, description and category of a %s',
    async (type) => {
      const { ws, path } = await open(spec);
      await ws.resources.create('x', type, newParams[type]);
      const name = `test/${type}/x`;

      await edit(ws, name, 'displayName', { name: 'change', to: 'Shown' });
      await edit(ws, name, 'description', { name: 'change', to: 'About' });
      await edit(ws, name, 'category', { name: 'change', to: 'Group' });

      expect(await ws.resources.show(name)).toMatchObject({
        displayName: 'Shown',
        description: 'About',
        category: 'Group',
      });
      expect(readJson(local(path, type, 'x.json'))).toMatchObject({
        displayName: 'Shown',
        description: 'About',
        category: 'Group',
      });
    },
  );

  describe('refusals leave the project as it was', () => {
    it.each([
      {
        why: 'a scalar is added to',
        name: 'test/cardTypes/page',
        key: 'displayName',
        operation: { name: 'add', target: 'x' } as const,
        error: /Cannot do operation add on scalar value/,
      },
      {
        why: 'a scalar is ranked',
        name: 'test/fieldTypes/size',
        key: 'description',
        operation: { name: 'rank', target: 'x', newIndex: 0 } as const,
        error: /Cannot do operation rank on scalar value/,
      },
      ...[
        ['the key is empty', 'test/workflows/flow', ''],
        ['the key is unknown', 'test/cardTypes/page', 'colour'],
        [
          'the key is unknown to a folder resource',
          'test/templates/tpl',
          'colour',
        ],
        ['the key belongs to another type', 'test/templates/tpl', 'workflow'],
      ].map(([why, name, key]) => ({
        why: `${why} (no route)`,
        name,
        key,
        operation: { name: 'change', to: 'red' } as const,
        error: /No mutation handler for input/,
      })),
      {
        why: 'the resource is a module resource',
        name: 'mod/workflows/mflow',
        key: 'displayName',
        operation: { name: 'change', to: 'x' } as const,
        error: /Cannot update module resources/,
      },
      {
        why: 'the new value is not valid for the resource',
        name: 'test/linkTypes/rel',
        key: 'enableLinkDescription',
        operation: { name: 'change', to: 'yes' } as const,
        error: /Cannot change 'enableLinkDescription'/,
      },
    ])('when $why', async ({ name, key, operation, error }) => {
      const { ws, path } = await open(spec);

      await expectRefused(path, () => edit(ws, name, key, operation), error);
    });

    it('when the resource does not exist', async () => {
      const { ws, path } = await open(spec);

      await expectRefused(
        path,
        () =>
          edit(ws, 'test/workflows/missing', 'displayName', {
            name: 'change',
            to: 'x',
          }),
        ResourceNotFoundError,
      );
    });
  });
});
