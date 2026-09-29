/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { describe, it, expect } from 'vitest';
import type { UpdatePlan } from '@cyberismo/data-handler';
import type { ProjectModule } from '@/lib/api/types';
import { moduleRow } from '@/lib/modules';

const mod = (over: Partial<ProjectModule>): ProjectModule => ({
  name: 'Base',
  cardKeyPrefix: 'base',
  isRoot: true,
  parents: [],
  installedVersion: '1.0.0',
  ...over,
});
const plan = (over: Partial<UpdatePlan> = {}): UpdatePlan => ({
  ok: true,
  changes: [],
  removed: [],
  conflicts: [],
  rangeWrites: [],
  roots: [
    {
      module: 'base',
      installed: '1.0.0',
      range: '^1.0.0',
      latest: '2.0.0',
      heldBack: true,
      versionSource: 'git',
    },
  ],
  ...over,
});
const change = { module: 'base', from: '1.0.0', to: '1.3.0', breaking: false };

describe('moduleRow', () => {
  it('gives a transitive module no actions and names its parents', () => {
    const core = mod({
      cardKeyPrefix: 'core',
      isRoot: false,
      parents: ['ext'],
    });
    const ext = mod({ name: 'Extension', cardKeyPrefix: 'ext' });
    const row = moduleRow(core, plan({ changes: [change] }), [core, ext]);
    expect(row.actions).toEqual({ update: false, remove: false });
    expect(row.managedBy).toEqual(['Extension']);
    expect(row.latestCompatible).toBeUndefined();
  });

  it.each([
    [[change], '1.3.0', false],
    [[], '1.0.0', true],
  ])('reads latest from the plan: changes %j', (changes, to, upToDate) => {
    const row = moduleRow(mod({}), plan({ changes }));
    expect(row).toMatchObject({
      latestCompatible: to,
      latestAvailable: '2.0.0',
      heldBack: true,
      upToDate,
    });
  });

  it('explains a blocked plan instead of showing versions', () => {
    const blocked = plan({
      ok: false,
      conflicts: [{ module: 'core', reason: 'x' }],
    });
    const row = moduleRow(mod({}), blocked);
    expect(row).toMatchObject({ blocked: true, upToDate: false });
    expect(row.latestCompatible).toBeUndefined();
    expect(row.latestAvailable).toBeUndefined();
  });

  it('claims nothing for a root the plan did not check', () => {
    const row = moduleRow(mod({ cardKeyPrefix: 'added' }), plan());
    expect(row.latestCompatible).toBeUndefined();
    expect(row.upToDate).toBe(false);
  });
});
