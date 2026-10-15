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

import { chmodSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CardNotFoundError } from '../../../src/shared/exceptions/index.js';
import { expectRefused, flow, metadataOf, projects } from './fixture.js';

const open = projects();
const spec = {
  workflows: [flow],
  cards: [{ title: 'A' }, { title: 'Done card', workflowState: 'Done' }],
};

describe('cards.transition', () => {
  it('moves the card to the target state and stamps the transition', async () => {
    const { ws, keys } = await open(spec);
    const before = await metadataOf(ws, keys[0]);

    await ws.cards.transition(keys[0], 'Start');

    const after = await metadataOf(ws, keys[0]);
    expect(new Date(after.lastTransitioned!).toISOString()).toBe(
      after.lastTransitioned,
    );
    expect(after.lastUpdated).not.toBe(before.lastUpdated);
    expect(after).toEqual({
      ...before,
      workflowState: 'Review',
      lastTransitioned: expect.any(String),
      lastUpdated: expect.any(String),
    });
  });

  it('takes a transition available from every state', async () => {
    const { ws, keys } = await open(spec);

    await ws.cards.transition(keys[1], 'Close');

    expect((await metadataOf(ws, keys[1])).workflowState).toBe('Done');
  });

  it.each([
    [
      'an unknown transition',
      'Nope',
      /does not contain state transition 'Nope'[\s\S]*Start, Finish, Close/,
    ],
    [
      'a transition not available from the state',
      'Start',
      /transition from state 'Done' for 'Start'/,
    ],
  ])('refuses %s', async (_name, transition, error) => {
    const { ws, path, keys } = await open(spec);

    await expectRefused(
      path,
      () => ws.cards.transition(keys[1], transition),
      error,
    );
  });

  it('refuses a missing card', async () => {
    const { ws, path } = await open(spec);

    await expectRefused(
      path,
      () => ws.cards.transition('test_zzzzzzzz', 'Start'),
      CardNotFoundError,
    );
  });

  it('fails, leaving the card as it was, when the state cannot be written', async () => {
    const { ws, path, keys } = await open(spec);
    const file = join(path, 'cardRoot', keys[0], 'index.json');
    chmodSync(file, 0o444);

    try {
      await expectRefused(
        path,
        () => ws.cards.transition(keys[0], 'Start'),
        /EACCES|EPERM/,
      );
    } finally {
      chmodSync(file, 0o644);
    }
  });
});
