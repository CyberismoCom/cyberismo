// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from 'vitest';

import { DHValidationError } from '../../../src/shared/exceptions/index.js';
import { edit, projects } from './fixture.js';

const open = projects();

describe('calculation edits are checked by the logic backend', () => {
  it('checks an edited calculation on its own, not with the project', async () => {
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

  it('refuses an invalid calculation with the diagnostics as a validation error', async () => {
    const { ws } = await open({ calculations: { calc: 'fact(1).\n' } });

    const refusal = await edit(
      ws,
      'test/calculations/calc',
      { key: 'content', subKey: 'calculation' },
      { name: 'change', to: 'this is not a logic program' },
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(DHValidationError);
    expect(refusal).toMatchObject({
      code: 'validation',
      details: {
        diagnostics: expect.arrayContaining([
          expect.objectContaining({ severity: 'error' }),
        ]),
      },
    });
  });
});
