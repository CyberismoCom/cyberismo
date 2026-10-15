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
import { edit, newParams, projects, snapshot, spec } from './fixture.js';

const open = projects();

type Opened = Awaited<ReturnType<typeof open>>;
type Keys = { cards: string[]; template: string };

const usedIn = (ws: Opened['ws'], name: string) => ws.resources.usage(name);

describe('where a resource is used', () => {
  // A card and a calculation that name the resource, whatever its type.
  it.each([
    'templates',
    'calculations',
    'reports',
    'graphModels',
    'graphViews',
    'skills',
  ] as const)(
    'lists the cards and calculations naming a %s resource',
    async (type) => {
      const { ws, keys } = await open({
        ...spec,
        cards: [{ content: `uses test/${type}/x` }],
      });
      await ws.resources.create('x', type, newParams[type]);
      await ws.resources.create('c', 'calculations', {});
      await edit(
        ws,
        'test/calculations/c',
        { key: 'content', subKey: 'calculation' },
        { name: 'change', to: `% test/${type}/x\n` },
      );

      // Cards come first, then calculations.
      expect(await usedIn(ws, `test/${type}/x`)).toEqual([
        keys[0],
        'test/calculations/c',
      ]);
    },
  );

  it.each([
    {
      resource: 'test/cardTypes/page',
      // Both project cards and the template card, then the link type.
      users: (k: Keys) => [
        ...k.cards.slice(0, 2),
        k.template,
        'test/linkTypes/rel',
      ],
    },
    {
      resource: 'test/fieldTypes/size',
      users: (k: Keys) => [
        k.cards[0],
        'test/cardTypes/page',
        'test/cardTypes/bare',
      ],
    },
    { resource: 'test/workflows/flow', users: () => ['test/cardTypes/page'] },
    { resource: 'test/linkTypes/rel', users: (k: Keys) => [k.cards[0]] },
  ])('lists what $resource is used by', async ({ resource, users }) => {
    const { ws, keys, templateKeys } = await open(spec);

    const used = await usedIn(ws, resource);

    expect([...used].sort()).toEqual(
      users({
        cards: keys,
        template: templateKeys['test/templates/tpl'][0],
      }).sort(),
    );
  });

  it('refuses a resource that is not there', async () => {
    const { ws, path } = await open(spec);
    const before = snapshot(path);

    await expect(
      ws.resources.usage('test/workflows/missing'),
    ).rejects.toBeInstanceOf(ResourceNotFoundError);
    expect(snapshot(path)).toEqual(before);
  });
});
