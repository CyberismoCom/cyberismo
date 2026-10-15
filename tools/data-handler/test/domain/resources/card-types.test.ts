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

import { ResourceNotFoundError } from '../../../src/shared/exceptions/index.js';
import {
  edit,
  expectRefused,
  projects,
  remove,
  rename,
  spec,
} from './fixture.js';
import { Validate } from '../../../src/domain/validation/validate.js';
import { checkoutOf } from '../../../src/infra/internal.js';

const open = projects();

const page = 'test/cardTypes/page';
const bare = 'test/cardTypes/bare';
const size = 'test/fieldTypes/size';
const note = 'test/fieldTypes/note';

const customFields = async (
  ws: Awaited<ReturnType<typeof open>>['ws'],
  name = bare,
) => {
  const shown = (await ws.resources.show(name)) as {
    customFields: { name: string; isCalculated: boolean }[];
    alwaysVisibleFields: string[];
    optionallyVisibleFields: string[];
  };
  return shown;
};

describe('card types', () => {
  describe('editing the field lists', () => {
    it('adds and ranks custom fields', async () => {
      const { ws } = await open(spec);

      await edit(ws, bare, 'customFields', {
        name: 'add',
        target: { name: note },
      });
      await edit(ws, bare, 'customFields', {
        name: 'rank',
        target: { name: note },
        newIndex: 0,
      });

      const shown = await customFields(ws);
      expect(shown.customFields.map((field) => field.name)).toEqual([
        note,
        size,
      ]);
    });

    it.each(['alwaysVisibleFields', 'optionallyVisibleFields'])(
      'adds a custom field to %s',
      async (key) => {
        const { ws } = await open(spec);

        await edit(ws, bare, key, { name: 'add', target: size });

        expect(await customFields(ws)).toMatchObject({ [key]: [size] });
      },
    );

    it('drops a removed custom field from both visibility lists', async () => {
      const { ws } = await open(spec);
      await edit(ws, bare, 'alwaysVisibleFields', {
        name: 'add',
        target: size,
      });
      await edit(ws, bare, 'optionallyVisibleFields', {
        name: 'add',
        target: size,
      });

      await edit(ws, bare, 'customFields', {
        name: 'remove',
        target: { name: size },
      });

      expect(await customFields(ws)).toMatchObject({
        customFields: [],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      });
    });

    describe('refusals leave the project as it was', () => {
      it.each([
        {
          why: 'the field type does not exist',
          key: 'customFields',
          operation: {
            name: 'add',
            target: { name: 'test/fieldTypes/ghost' },
          },
          error: ResourceNotFoundError,
        },
        {
          why: 'the field type is a module that does not exist',
          key: 'alwaysVisibleFields',
          operation: { name: 'add', target: 'nope/fieldTypes/x' },
          error: ResourceNotFoundError,
        },
        {
          why: 'a visible field is not a custom field of the card type',
          key: 'alwaysVisibleFields',
          operation: { name: 'add', target: note },
          error: /not defined in card type/,
        },
        {
          why: 'the custom field is there already',
          key: 'customFields',
          operation: { name: 'add', target: { name: size } },
          error: /already exists/,
        },
        {
          why: 'the custom field to remove is not there',
          key: 'customFields',
          operation: { name: 'remove', target: { name: note } },
          error: /Cannot perform operation on 'customFields'/,
        },
      ])('when $why', async ({ key, operation, error }) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () => edit(ws, bare, key, operation as never),
          error,
        );
      });
    });
  });

  describe('changing the workflow', () => {
    const mapping = { Open: 'Open', 'In Progress': 'Closed', Closed: 'Closed' };
    const change = (
      ws: Awaited<ReturnType<typeof open>>['ws'],
      stateMapping?: Record<string, string>,
      to = 'test/workflows/other',
    ) =>
      edit(ws, page, 'workflow', {
        name: 'change',
        target: 'test/workflows/flow',
        to,
        mappingTable: stateMapping && { stateMapping },
      });

    it('moves the cards to the states the mapping names', async () => {
      const { ws, keys } = await open(spec);

      await change(ws, mapping);

      expect(await ws.resources.show(page)).toMatchObject({
        workflow: 'test/workflows/other',
      });
      const [parent, child] = await Promise.all(
        keys.slice(0, 2).map((key) => ws.cards.details(key)),
      );
      expect(parent.metadata).toMatchObject({ workflowState: 'Open' });
      expect(child.metadata).toMatchObject({ workflowState: 'Closed' });
    });

    it('leaves the cards in their states when there is no mapping', async () => {
      const { ws, keys } = await open(spec);

      await change(ws);

      expect(await ws.resources.show(page)).toMatchObject({
        workflow: 'test/workflows/other',
      });
      expect((await ws.cards.details(keys[1])).metadata).toMatchObject({
        workflowState: 'In Progress',
      });
    });

    it.each([
      {
        why: 'the mapping leaves a state of the old workflow out',
        stateMapping: { Open: 'Open', 'In Progress': 'Closed' },
        error: /not mapped from in the state mapping[^]*Closed/,
      },
      {
        why: 'the mapping targets a state the new workflow lacks',
        stateMapping: { ...mapping, Open: 'Draft' },
        error: /do not exist in the new workflow[^]*Draft/,
      },
    ])('refuses it when $why', async ({ stateMapping, error }) => {
      const { ws, path } = await open(spec);

      await expectRefused(path, () => change(ws, stateMapping), error);
    });

    // Pins today's behaviour: the edit does not check the workflow exists;
    // only project validation reports it.
    it('accepts a workflow that does not exist', async () => {
      const { ws, path } = await open(spec);

      await change(ws, undefined, 'test/workflows/ghost');

      expect(await ws.resources.show(page)).toMatchObject({
        workflow: 'test/workflows/ghost',
      });
      expect(
        await Validate.getInstance().validate(path, () => checkoutOf(ws)),
      ).toContain('ghost');
    });
  });

  describe('renaming', () => {
    it('moves its cards, link types and references to the new name', async () => {
      const { ws, keys, templateKeys } = await open(spec);
      const named = 'test/cardTypes/sheet';

      await rename(ws, page, 'sheet');

      expect(await ws.resources.show(named)).toMatchObject({ name: named });
      await expect(ws.resources.show(page)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      for (const key of keys.slice(0, 2)) {
        expect((await ws.cards.details(key)).metadata).toMatchObject({
          cardType: named,
        });
      }
      expect((await ws.cards.details(keys[2])).metadata).toMatchObject({
        cardType: bare,
      });
      expect(await ws.resources.show('test/linkTypes/rel')).toMatchObject({
        sourceCardTypes: [named],
      });
      expect(
        await ws.cards.details(templateKeys['test/templates/tpl'][0]),
      ).toMatchObject({ metadata: { cardType: named } });
      expect(
        await ws.resources.validate({
          prefix: 'test',
          type: 'cardTypes',
          identifier: 'sheet',
        }),
      ).toBe('');
    });
  });

  describe('removing', () => {
    it('removes its cards and its place in link types, keeping the rest', async () => {
      const { ws, keys } = await open(spec);

      await remove(ws, page);

      await expect(ws.resources.show(page)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      expect(await ws.resources.show('test/linkTypes/rel')).toMatchObject({
        sourceCardTypes: [],
      });
      expect((await ws.cards.roots()).map((card) => card.key)).toEqual([
        keys[2],
      ]);
      await expect(ws.cards.details(keys[0])).rejects.toThrow();
    });

    it('refuses a card type of a module, changing nothing', async () => {
      const { ws, path } = await open({
        ...spec,
        modules: [
          {
            prefix: 'mod',
            workflows: [{ name: 'w' }],
            cardTypes: [{ name: 'mt' }],
          },
        ],
      });

      await expectRefused(
        path,
        () => remove(ws, 'mod/cardTypes/mt'),
        /It is a module resource/,
      );
    });
  });
});
