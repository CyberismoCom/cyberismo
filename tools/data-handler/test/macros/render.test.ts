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

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { RenderOptions } from '@cyberismo/model';
import type * as macros from '../../src/domain/macros/index.js';
import type { Workspace } from '../../src/api/workspace/workspace.js';
import { copyDir } from '../../src/shared/utils/file-utils.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';
import { getTestBaseDir } from '../helpers/test-utils.js';

// Macro evaluation reports a failing macro inline; a failure that escapes it
// is simulated here.
const failure = vi.hoisted(() => ({ error: undefined as Error | undefined }));
vi.mock('../../src/domain/macros/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof macros>();
  return {
    ...original,
    evaluateMacros: (...args: Parameters<typeof original.evaluateMacros>) => {
      if (failure.error) throw failure.error;
      return original.evaluateMacros(...args);
    },
  };
});

const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
const testDir = join(baseDir, 'tmp-macros-render-tests');

let ws: Workspace;

beforeAll(async () => {
  mkdirSync(testDir, { recursive: true });
  await copyDir('test/test-data/', testDir);
  ws = await openTestWorkspace(join(testDir, 'valid/decision-records'));
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('render', () => {
  const options: RenderOptions = {
    cardKey: 'decision_5',
    context: 'localApp',
    mode: 'static',
  };
  const content = 'Before {{#report}}{}{{/report}} after';

  it('evaluates the macros of the content', async () => {
    expect(
      await ws.render.macros(
        'See {{#xref}}"cardKey": "decision_6"{{/xref}}.',
        options,
      ),
    ).toEqual({ content: 'See <<decision_6>>.' });
  });

  it.each([
    { given: 'no fallback', fallback: undefined, after: content },
    { given: 'a fallback', fallback: '', after: '' },
  ])('gives the error text when a macro fails, $given', async (row) => {
    failure.error = new Error('boom');
    try {
      expect(
        await ws.render.macros(content, { ...options, fallback: row.fallback }),
      ).toEqual({
        content: `Macro error: boom\n\n${row.after}`,
        error: 'boom',
      });
    } finally {
      failure.error = undefined;
    }
  });

  it('rewrites card xrefs for the mode', async () => {
    expect(
      await ws.render.xrefs('See xref:decision_6.adoc[Child].', 'static'),
    ).toBe('See <<decision_6,Child>>.');
  });
});
