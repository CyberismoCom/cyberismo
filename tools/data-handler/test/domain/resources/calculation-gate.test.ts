// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { edit, projects } from './fixture.js';

const open = projects();

describe('calculation edits are checked by the logic backend', () => {
  it('logic/calculations: Edit checked on its own', async () => {
    const { ws } = await open({
      calculations: { calc: 'fact(1).\n' },
      cards: [{ title: 'C0' }],
    });

    await edit(
      ws,
      'test/calculations/calc',
      { key: 'content', subKey: 'calculation' },
      { name: 'change', to: ':- card(C).\n' },
    );

    expect(
      (
        (await ws.resources.show('test/calculations/calc')) as unknown as {
          content: { calculation: string };
        }
      ).content.calculation,
    ).toBe(':- card(C).\n');
  });
});
