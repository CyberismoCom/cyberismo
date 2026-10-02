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
import {
  bindingOf,
  bindingScope,
  moduleRow,
  newestMatching,
  rangeFor,
  selectableVersions,
  submitState,
  type SubmitInput,
} from '@/lib/modules';

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
  unchecked: [],
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
  it.each([
    ['git', true, true],
    ['file', true, false],
    ['private', true, false],
  ] as const)(
    'offers Change version for %s source, root %s: %s',
    (versionSource, isRoot, offered) => {
      const row = moduleRow(mod({ versionSource, isRoot }));
      expect(row.actions.changeVersion).toBe(offered);
    },
  );

  it('gives a transitive module no actions and names its parents', () => {
    const core = mod({
      cardKeyPrefix: 'core',
      isRoot: false,
      parents: ['ext'],
    });
    const ext = mod({ name: 'Extension', cardKeyPrefix: 'ext' });
    const row = moduleRow(core, plan({ changes: [change] }), [core, ext]);
    expect(row.actions).toEqual({
      update: false,
      remove: false,
      changeVersion: false,
    });
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

  it('marks a private root the plan could not check', () => {
    const p = plan();
    p.roots[0] = {
      ...p.roots[0],
      latest: null,
      heldBack: false,
      unchecked: true,
    };
    expect(moduleRow(mod({}), p)).toMatchObject({
      unchecked: true,
      latestCompatible: '1.0.0',
      latestAvailable: undefined,
    });
  });

  it('claims nothing for a root the plan did not check', () => {
    const row = moduleRow(mod({ cardKeyPrefix: 'added' }), plan());
    expect(row.latestCompatible).toBeUndefined();
    expect(row.upToDate).toBe(false);
  });
});

describe('rangeFor / bindingScope / bindingOf', () => {
  it.each([
    ['1.2.3', 'exact', '1.2.3', '1.2.3 only'],
    ['1.2.3', 'minor', '~1.2.3', '1.2.x'],
    ['1.2.3', 'major', '^1.2.3', '1.x'],
    ['0.3.1', 'major', '^0.3.1', '0.3.x'],
    ['0.0.3', 'major', '^0.0.3', '0.0.3 only'],
  ] as const)('%s %s', (version, binding, range, scope) => {
    expect(rangeFor(version, binding)).toBe(range);
    expect(bindingScope(version, binding)).toBe(scope);
    expect(bindingOf(range)).toBe(binding);
  });
});

describe('newestMatching', () => {
  const versions = ['2.1.0', '2.0.0', '1.9.0', '1.4.3', '0.3.2'];
  it.each([
    ['^1.4.3', '1.9.0'],
    ['~1.4.3', '1.4.3'],
    ['1.4.3', '1.4.3'],
    ['^0.3.1', '0.3.2'],
    ['^3.0.0', undefined],
  ])('%s', (range, newest) => {
    expect(newestMatching(versions, range)).toBe(newest);
  });
});

describe('submitState', () => {
  const base: SubmitInput = {
    mode: 'install',
    source: 'https://host/x.git',
    listing: 'versions',
    version: '2.0.0',
    binding: 'major',
  };
  it.each<[string, Partial<SubmitInput>, boolean, string?]>([
    ['listing error', { listing: 'error' }, false],
    ['loading', { listing: 'loading' }, false],
    ['source changed since listing', { listing: 'stale' }, false],
    ['empty source', { source: ' ' }, false],
    ['credentials', { source: 'https://u:t@host/x.git' }, false],
    ['default binding', {}, true, '^2.0.0'],
    ['tagless install', { listing: 'empty' }, true],
    ['tagless change', { listing: 'empty', mode: 'change' }, false],
    ['change without source', { mode: 'change', source: '' }, true, '^2.0.0'],
  ])('%s', (_, over, canSubmit, range) => {
    const state = submitState({ ...base, ...over });
    expect(state.canSubmit).toBe(canSubmit);
    expect(state.range).toBe(range);
  });
});

it('lists no versions below the installed one when changing', () => {
  const all = ['2.0.0', '1.3.0', '1.0.0'];
  expect(selectableVersions('change', all, '1.3.0')).toEqual([
    '2.0.0',
    '1.3.0',
  ]);
  expect(selectableVersions('change', all, '2.0.0')).toEqual(['2.0.0']);
});
