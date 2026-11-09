// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { DHValidationError } from '../../../src/shared/exceptions/index.js';
import type { Workspace } from '../../../src/api/workspace.js';
import { edit, local, projects } from './fixture.js';
import { checkoutOf } from '../../../src/state/checkout/internal.js';
import type { Program } from '../../../src/infra/logic/logic-backend.js';

const open = projects();

const calculation = async (ws: Workspace) =>
  (
    (await ws.resources.show('test/calculations/calc')) as unknown as {
      content: { calculation: string };
    }
  ).content.calculation;

describe('calculation edits are checked by the logic backend', () => {
  it('checks an edited calculation on its own before writing it, not with the project', async () => {
    const { ws, path } = await open({
      calculations: { calc: 'fact(1).\n' },
      cards: [{ title: 'C0' }],
    });
    // Valid on its own; with the project's cards it has no answer.
    const edited = ':- card(C).\n';
    const stored = local(path, 'calculations', 'calc', 'calculation.lp');
    const engine = checkoutOf(ws).calculationEngine;
    const check = engine.check.bind(engine);
    let checkedBeforeWrite: Program[] | undefined;
    vi.spyOn(engine, 'check').mockImplementation(async (programs) => {
      if (readFileSync(stored, 'utf-8') === 'fact(1).\n') {
        checkedBeforeWrite ??= programs;
      }
      return check(programs);
    });

    await edit(
      ws,
      'test/calculations/calc',
      { key: 'content', subKey: 'calculation' },
      { name: 'change', to: edited },
    );

    expect(checkedBeforeWrite).toEqual([
      expect.objectContaining({ text: edited }),
    ]);
    expect(await calculation(ws)).toBe(edited);
  });

  it('refuses an invalid calculation with the diagnostics as a validation error, keeping the stored one', async () => {
    const { ws, path } = await open({ calculations: { calc: 'fact(1).\n' } });

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
    // Checked before it is written: neither the files nor the caches have it.
    expect(
      readFileSync(
        local(path, 'calculations', 'calc', 'calculation.lp'),
        'utf-8',
      ),
    ).toBe('fact(1).\n');
    expect(await calculation(ws)).toBe('fact(1).\n');
  });
});
