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

import type { LinkType } from '@cyberismo/model';
import { ResourceNotFoundError } from '../../src/exceptions/index.js';
import {
  edit,
  expectRefused,
  local,
  projects,
  readJson,
  remove,
  rename,
  spec,
} from './fixture.js';

const open = projects();

const rel = 'test/linkTypes/rel';
const bare = 'test/cardTypes/bare';
type Opened = Awaited<ReturnType<typeof open>>;

const linkType = async (ws: Opened['ws'], name = rel) =>
  (await ws.resources.show(name)) as LinkType;
const linksOf = async (ws: Opened['ws'], key: string) =>
  (await ws.cards.details(key)).metadata?.links;

describe('link types', () => {
  describe('editing', () => {
    it.each([
      { key: 'enableLinkDescription', to: true },
      { key: 'outboundDisplayName', to: 'leads to' },
      { key: 'inboundDisplayName', to: 'led by' },
    ])('changes $key', async ({ key, to }) => {
      const { ws } = await open(spec);

      await edit(ws, rel, key, { name: 'change', to });

      expect(await linkType(ws)).toMatchObject({ [key]: to });
    });

    it.each(['sourceCardTypes', 'destinationCardTypes'])(
      'adds a card type to %s and removes it again',
      async (key) => {
        const { ws } = await open(spec);

        await edit(ws, rel, key, { name: 'add', target: bare });
        expect(await linkType(ws)).toMatchObject({
          [key]: expect.arrayContaining([bare]),
        });
        await edit(ws, rel, key, { name: 'remove', target: bare });

        expect((await linkType(ws))[key as 'sourceCardTypes']).not.toContain(
          bare,
        );
      },
    );

    it.each(['sourceCardTypes', 'destinationCardTypes'] as const)(
      'replaces a card type in %s',
      async (key) => {
        const { ws } = await open(spec);
        await edit(ws, rel, key, { name: 'add', target: bare });

        await edit(ws, rel, key, {
          name: 'change',
          target: bare,
          to: 'test/cardTypes/renamed',
        });

        const list = (await linkType(ws))[key];
        expect(list).toContain('test/cardTypes/renamed');
        expect(list).not.toContain(bare);
      },
    );

    // Pins today's behaviour: the card type is not checked to exist, and
    // links the new lists would no longer allow are left in place.
    it('accepts a card type that does not exist', async () => {
      const { ws } = await open(spec);

      await edit(ws, rel, 'destinationCardTypes', {
        name: 'add',
        target: 'test/cardTypes/ghost',
      });

      expect((await linkType(ws)).destinationCardTypes).toEqual([
        'test/cardTypes/ghost',
      ]);
    });

    it.each([
      {
        why: 'the card type is there already',
        operation: { name: 'add', target: 'test/cardTypes/page' },
        error: /already exists/,
      },
      {
        why: 'the card type to remove is not there',
        operation: { name: 'remove', target: bare },
        error: /Cannot perform operation on 'sourceCardTypes'/,
      },
    ])(
      'refuses it when $why, changing nothing',
      async ({ operation, error }) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () => edit(ws, rel, 'sourceCardTypes', operation as never),
          error,
        );
      },
    );
  });

  describe('renaming', () => {
    it('renames the file and the links of the cards that use it', async () => {
      const { ws, keys, path } = await open(spec);

      await rename(ws, rel, 'tie');

      expect(readJson(local(path, 'linkTypes', 'tie.json'))).toMatchObject({
        name: 'test/linkTypes/tie',
      });
      expect(await linksOf(ws, keys[0])).toEqual([
        expect.objectContaining({
          linkType: 'test/linkTypes/tie',
          cardKey: keys[1],
        }),
      ]);
      await expect(ws.resources.show(rel)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
    });
  });

  describe('removing', () => {
    it('removes the links of that type from the cards', async () => {
      const { ws, keys } = await open(spec);

      await remove(ws, rel);

      await expect(ws.resources.show(rel)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      expect(await linksOf(ws, keys[0])).toEqual([]);
    });
  });
});
