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

import type { FieldType } from '@cyberismo/model';
import { ResourceNotFoundError } from '../../../src/shared/exceptions/index.js';
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

const size = 'test/fieldTypes/size';
const level = 'test/fieldTypes/level';
const spare = 'test/fieldTypes/spare';
type Opened = Awaited<ReturnType<typeof open>>;

const valueOf = async (ws: Opened['ws'], key: string, field: string) =>
  (await ws.cards.details(key)).metadata?.[field];
const enumValues = async (ws: Opened['ws']) =>
  ((await ws.resources.show(level)) as FieldType).enumValues?.map(
    (item) => item.enumValue,
  );

describe('field types', () => {
  describe('changing the data type', () => {
    it.each([
      { name: size, to: 'shortText', before: 3, after: '3' },
      { name: size, to: 'number', before: 3, after: 3 },
      { name: spare, to: 'longText', before: 'kept', after: 'kept' },
    ])(
      'to $to converts the values the cards hold',
      async ({ name, to, before, after }) => {
        const { ws, keys } = await open(spec);
        const key = name === spare ? keys[2] : keys[0];
        expect(await valueOf(ws, key, name)).toBe(before);

        await edit(ws, name, 'dataType', {
          name: 'change',
          target: ((await ws.resources.show(name)) as FieldType).dataType,
          to,
        });

        expect(await ws.resources.show(name)).toMatchObject({ dataType: to });
        expect(await valueOf(ws, key, name)).toBe(after);
      },
    );

    describe('refusals leave the project as it was', () => {
      it.each([
        {
          why: 'the type is the same',
          to: 'integer',
          error: /already 'integer'/,
        },
        {
          why: 'the type is unknown',
          to: 'colour',
          error: /unknown type 'colour'/,
        },
        {
          why: 'the conversion is not allowed',
          to: 'boolean',
          error: /Cannot change data type from 'integer' to 'boolean'/,
        },
      ])('when $why', async ({ to, error }) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () =>
            edit(ws, size, 'dataType', {
              name: 'change',
              target: 'integer',
              to,
            }),
          error,
        );
      });
    });
  });

  describe('editing the enum values', () => {
    it('adds a value', async () => {
      const { ws } = await open(spec);

      await edit(ws, level, 'enumValues', {
        name: 'add',
        target: { enumValue: 'mid' },
      });

      expect(await enumValues(ws)).toEqual(['low', 'high', 'mid']);
    });

    it('renames a value on the field type and on the cards holding it', async () => {
      const { ws, keys } = await open(spec);

      await edit(ws, level, 'enumValues', {
        name: 'change',
        target: { enumValue: 'low' },
        to: { enumValue: 'lowest' },
      });

      expect(await enumValues(ws)).toEqual(['lowest', 'high']);
      expect(await valueOf(ws, keys[0], level)).toBe('lowest');
      expect(await valueOf(ws, keys[1], level)).toBe('high');
    });

    it('changes a value without renaming it, leaving the cards alone', async () => {
      const { ws, keys } = await open(spec);

      await edit(ws, level, 'enumValues', {
        name: 'change',
        target: { enumValue: 'low' },
        to: { enumValue: 'low', enumDisplayValue: 'Low' },
      });

      expect(
        ((await ws.resources.show(level)) as FieldType).enumValues?.[0],
      ).toEqual({ enumValue: 'low', enumDisplayValue: 'Low' });
      expect(await valueOf(ws, keys[0], level)).toBe('low');
    });

    it.each([
      // The cards that held the removed value take the replacement.
      { replacement: { enumValue: 'high' }, cardValue: 'high' },
      // Without one they keep the value the enum no longer has.
      { replacement: undefined, cardValue: 'low' },
    ])(
      'removes a value; its cards then hold $cardValue',
      async ({ replacement, cardValue }) => {
        const { ws, keys } = await open(spec);

        await edit(ws, level, 'enumValues', {
          name: 'remove',
          target: { enumValue: 'low' },
          replacementValue: replacement,
        });

        expect(await enumValues(ws)).toEqual(['high']);
        expect(await valueOf(ws, keys[0], level)).toBe(cardValue);
      },
    );

    describe('refusals leave the project as it was', () => {
      it.each([
        {
          why: 'the value is there already',
          operation: { name: 'add', target: { enumValue: 'low' } },
          error: /Enum with value 'low' already exists/,
        },
        {
          why: 'the value to remove is not there',
          operation: { name: 'remove', target: { enumValue: 'ghost' } },
          error: /Enum with value 'ghost' does not exist/,
        },
        {
          why: 'a value would be renamed to one that is there',
          operation: {
            name: 'change',
            target: { enumValue: 'low' },
            to: { enumValue: 'high' },
          },
          error: /Enum with value 'high' already exists/,
        },
      ])('when $why', async ({ operation, error }) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () => edit(ws, level, 'enumValues', operation as never),
          error,
        );
      });
    });
  });

  describe('renaming', () => {
    it('renames the file and the card values held under its name', async () => {
      const { ws, keys, path } = await open(spec);
      const named = 'test/fieldTypes/extra';

      await rename(ws, spare, 'extra');

      expect(readJson(local(path, 'fieldTypes', 'extra.json'))).toMatchObject({
        name: named,
      });
      expect(await valueOf(ws, keys[2], named)).toBe('kept');
      expect(await valueOf(ws, keys[2], spare)).toBeUndefined();
    });

    it('is refused while a card type uses the field, changing nothing', async () => {
      const { ws, path } = await open(spec);

      await expectRefused(
        path,
        () => rename(ws, size, 'extent'),
        /referenced by card type 'test\/cardTypes\/\w+'/,
      );
    });
  });

  describe('removing', () => {
    it('takes the field off the card types and leaves the stored values', async () => {
      const { ws, keys } = await open(spec);

      await remove(ws, size);

      await expect(ws.resources.show(size)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      expect(
        (
          (await ws.resources.show('test/cardTypes/page')) as {
            customFields: { name: string }[];
          }
        ).customFields.map((field) => field.name),
      ).toEqual(['test/fieldTypes/note', level]);
      expect(await valueOf(ws, keys[0], size)).toBe(3);
    });

    it('refuses a field type of a module, changing nothing', async () => {
      const { ws, path } = await open(spec);

      await expectRefused(
        path,
        () => remove(ws, 'mod/fieldTypes/mfield'),
        /It is a module resource/,
      );
    });
  });
});
