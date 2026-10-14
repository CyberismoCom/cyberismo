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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type { CreateParams } from '@cyberismo/model';

import { classify } from '../../src/mutations/dispatcher.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import type { Workspace } from '../../src/workspace/workspace.js';
import { openTestWorkspace } from '../helpers/open-test-workspace.js';

const creates: [string, CreateParams][] = [
  ['calculations', {}],
  ['cardTypes', { workflow: 'decision/workflows/decision' }],
  ['fieldTypes', { dataType: 'shortText' }],
  ['graphModels', {}],
  ['graphViews', {}],
  ['linkTypes', {}],
  ['reports', {}],
  ['skills', {}],
  ['templates', {}],
  ['workflows', {}],
];

// A new resource has no consumers, so creating one never asks for a version.
describe('resource create classification', () => {
  it.each(creates)('a %s create is classified none', (type, params) => {
    const target = resourceName(`decision/${type}/created`);
    expect(classify({ kind: 'create', target, params })).toBe('none');
  });

  describe('version gate', () => {
    let dir: string;
    let ws: Workspace;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'create-gate-'));
      await cp(
        join(import.meta.dirname, '../test-data/valid/decision-records'),
        dir,
        { recursive: true },
      );
      ws = await openTestWorkspace(dir, { autocommit: true });
      await ws.checkout.configuration.setVersion('1.0.0');
      await simpleGit(dir).add('.').commit('Set version');
    });

    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('admits every create in a patch', async () => {
      for (const [type, params] of creates) {
        await ws.changes.apply({
          kind: 'create',
          target: resourceName(`decision/${type}/created`),
          params,
        });
      }
      const { newVersion } = await ws.versions.bump('patch');
      expect(newVersion).toBe('1.0.1');
    });
  });
});
