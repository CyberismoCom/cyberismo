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

import type { Workflow } from '@cyberismo/model';
import { ResourceNotFoundError } from '../../src/shared/exceptions/index.js';
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

const flow = 'test/workflows/flow';
type Opened = Awaited<ReturnType<typeof open>>;

const workflow = async (ws: Opened['ws'], name = flow) =>
  (await ws.resources.show(name)) as Workflow;
const transitionOf = (shown: Workflow, name: string) =>
  shown.transitions.find((transition) => transition.name === name);
const stateOf = async (ws: Opened['ws'], key: string) =>
  (await ws.cards.details(key)).metadata?.workflowState;

describe('workflows', () => {
  describe('editing states and transitions', () => {
    it('adds a state and a transition into it', async () => {
      const { ws } = await open(spec);

      await edit(ws, flow, 'states', {
        name: 'add',
        target: { name: 'Review', category: 'active' },
      });
      await edit(ws, flow, 'transitions', {
        name: 'add',
        target: { name: 'Look', fromState: ['Open'], toState: 'Review' },
      });

      const shown = await workflow(ws);
      expect(shown.states.map((state) => state.name)).toEqual([
        'Open',
        'In Progress',
        'Closed',
        'Review',
      ]);
      expect(transitionOf(shown, 'Look')).toEqual({
        name: 'Look',
        fromState: ['Open'],
        toState: 'Review',
      });
    });

    it('ranks a state and removes a transition', async () => {
      const { ws } = await open(spec);

      await edit(ws, flow, 'states', {
        name: 'rank',
        target: { name: 'Closed', category: 'closed' },
        newIndex: 1,
      });
      await edit(ws, flow, 'transitions', {
        name: 'remove',
        target: { name: 'To Closed' },
      });

      const shown = await workflow(ws);
      expect(shown.states.map((state) => state.name)).toEqual([
        'Open',
        'Closed',
        'In Progress',
      ]);
      expect(transitionOf(shown, 'To Closed')).toBeUndefined();
    });

    it('changes a transition to the one given', async () => {
      const { ws } = await open(spec);

      await edit(ws, flow, 'transitions', {
        name: 'change',
        target: { name: 'To Closed' },
        to: { name: 'Finish', fromState: ['In Progress'], toState: 'Closed' },
      });

      const shown = await workflow(ws);
      expect(transitionOf(shown, 'Finish')).toMatchObject({
        fromState: ['In Progress'],
      });
      expect(transitionOf(shown, 'To Closed')).toBeUndefined();
    });

    it('refuses to rename a transition from its name alone', async () => {
      const { ws, path } = await open(spec);

      await expectRefused(
        path,
        () =>
          edit(ws, flow, 'transitions', {
            name: 'change',
            target: 'To In Progress',
            to: 'Start',
          }),
        /Invalid content JSON/,
      );
    });

    // Pins today's behaviour: the target state of a transition is not checked.
    it('accepts a transition into a state the workflow lacks', async () => {
      const { ws } = await open(spec);

      await edit(ws, flow, 'transitions', {
        name: 'add',
        target: { name: 'Lost', fromState: ['Open'], toState: 'Nowhere' },
      });

      expect(transitionOf(await workflow(ws), 'Lost')?.toState).toBe('Nowhere');
    });

    describe('refusals leave the project as it was', () => {
      it.each([
        {
          why: 'the state is there already',
          key: 'states',
          operation: {
            name: 'add',
            target: { name: 'Open', category: 'initial' },
          },
          error: /already exists/,
        },
        {
          why: 'a state change names no category',
          key: 'states',
          operation: {
            name: 'change',
            target: { name: 'Open', category: 'initial' },
            to: { name: 'Fresh' },
          },
          error: /must have 'name' and 'category'/,
        },
        {
          why: 'a removal names a replacement the workflow lacks',
          key: 'states',
          operation: {
            name: 'remove',
            target: { name: 'Closed', category: 'closed' },
            replacementValue: { name: 'Ghost', category: 'closed' },
          },
          error: /unknown state 'Ghost'/,
        },
        {
          why: 'the new-card transition would go',
          key: 'transitions',
          operation: { name: 'remove', target: { name: 'Create' } },
          error: /exactly one transition/,
        },
        {
          why: 'two transitions would share a name',
          key: 'transitions',
          operation: {
            name: 'add',
            target: {
              name: 'To Closed',
              fromState: ['Open'],
              toState: 'Closed',
            },
          },
          error: /transition names must be unique/,
        },
      ])('when $why', async ({ key, operation, error }) => {
        const { ws, path } = await open(spec);

        await expectRefused(
          path,
          () => edit(ws, flow, key, operation as never),
          error,
        );
      });
    });
  });

  describe('changing the states of cards', () => {
    it('renames a state, in the transitions and in the cards that are in it', async () => {
      const { ws, keys } = await open(spec);

      await edit(ws, flow, 'states', {
        name: 'change',
        target: { name: 'In Progress', category: 'active' },
        to: { name: 'Doing', category: 'active' },
      });

      const shown = await workflow(ws);
      expect(shown.states.map((state) => state.name)).toContain('Doing');
      expect(transitionOf(shown, 'To In Progress')?.toState).toBe('Doing');
      expect(await stateOf(ws, keys[1])).toBe('Doing');
      expect(await stateOf(ws, keys[0])).toBe('Open');
    });

    it.each([
      {
        replacement: { name: 'Closed', category: 'closed' },
        cardState: 'Closed',
        transitionKept: true,
      },
      // Without one the cards take the state a new card gets.
      { replacement: undefined, cardState: 'Open', transitionKept: false },
    ])(
      'removes a state; its cards go to $cardState (replacement $replacement)',
      async ({ replacement, cardState, transitionKept }) => {
        const { ws, keys } = await open(spec);

        await edit(ws, flow, 'states', {
          name: 'remove',
          target: { name: 'In Progress', category: 'active' },
          replacementValue: replacement,
        });

        const shown = await workflow(ws);
        expect(shown.states.map((state) => state.name)).toEqual([
          'Open',
          'Closed',
        ]);
        expect(await stateOf(ws, keys[1])).toBe(cardState);
        expect(transitionOf(shown, 'To In Progress') !== undefined).toBe(
          transitionKept,
        );
      },
    );
  });

  describe('renaming', () => {
    it('renames its file and the card types that use it', async () => {
      const { ws, path } = await open(spec);

      await rename(ws, flow, 'track');

      expect(readJson(local(path, 'workflows', 'track.json'))).toMatchObject({
        name: 'test/workflows/track',
      });
      expect(await workflow(ws, 'test/workflows/track')).toMatchObject({
        name: 'test/workflows/track',
      });
      expect(await ws.resources.show('test/cardTypes/page')).toMatchObject({
        workflow: 'test/workflows/track',
      });
      await expect(ws.resources.show(flow)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
    });
  });

  describe('removing', () => {
    it('removes the card types that use it, and their cards', async () => {
      const { ws, keys } = await open(spec);

      await remove(ws, flow);

      await expect(ws.resources.show(flow)).rejects.toBeInstanceOf(
        ResourceNotFoundError,
      );
      await expect(
        ws.resources.show('test/cardTypes/page'),
      ).rejects.toBeInstanceOf(ResourceNotFoundError);
      expect((await ws.cards.roots()).map((card) => card.key)).toEqual([
        keys[2],
      ]);
      expect(await ws.resources.show('test/cardTypes/bare')).toBeDefined();
    });
  });
});
