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
  type Binding,
  bindingScope,
  moduleRow,
  type ModuleRow,
  newestMatching,
  newestStable,
  rangeFor,
  selectableVersions,
  submitDecision,
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
const root: UpdatePlan['roots'][number] = {
  module: 'base',
  installed: '1.0.0',
  range: '^1.0.0',
  latest: '2.0.0',
  heldBack: true,
  versionSource: 'git',
};
const plan = (over: Partial<UpdatePlan> = {}): UpdatePlan => ({
  ok: true,
  changes: [],
  removed: [],
  conflicts: [],
  rangeWrites: [],
  roots: [root],
  ...over,
});
const change = { module: 'base', from: '1.0.0', to: '1.3.0', breaking: false };

describe('moduleRow', () => {
  it.each<{ versionSource: ProjectModule['versionSource']; offered: boolean }>([
    { versionSource: 'git', offered: true },
    { versionSource: 'file', offered: false },
    { versionSource: 'private', offered: false },
  ])(
    'offers Change version for a root with $versionSource source: $offered',
    ({ versionSource, offered }) => {
      const row = moduleRow(mod({ versionSource }), undefined, []);
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
  });

  it.each<{
    name: string;
    changes: UpdatePlan['changes'];
    root?: Partial<UpdatePlan['roots'][number]>;
    module?: Partial<ProjectModule>;
    expected: Partial<ModuleRow>;
  }>([
    {
      name: 'an update is pending',
      changes: [change],
      expected: {
        latestCompatible: '1.3.0',
        latestAvailable: '2.0.0',
        heldBack: true,
        upToDate: false,
      },
    },
    {
      name: 'already current',
      changes: [],
      expected: { latestCompatible: '1.0.0', upToDate: true },
    },
    {
      name: 'latest equals compatible',
      changes: [change],
      root: { latest: '1.3.0', heldBack: false },
      expected: {
        latestCompatible: '1.3.0',
        latestAvailable: null,
        heldBack: false,
      },
    },
    {
      name: 'range is assumed',
      changes: [],
      expected: { assumedRange: '^1.0.0' },
    },
    {
      name: 'range is declared',
      changes: [],
      module: { declaredRange: '^1.0.0' },
      expected: { assumedRange: null },
    },
  ])('reads versions from the plan: $name', (c) => {
    const checked = plan({
      changes: c.changes,
      roots: [{ ...root, ...c.root }],
    });
    expect(moduleRow(mod(c.module ?? {}), checked, [])).toMatchObject(
      c.expected,
    );
  });

  it('explains a blocked plan instead of showing versions', () => {
    const blocked = plan({
      ok: false,
      conflicts: [{ module: 'core', reason: 'x' }],
    });
    const row = moduleRow(mod({}), blocked, []);
    expect(row.latestCompatible).toBeNull();
    expect(row.latestAvailable).toBeNull();
  });

  it('claims nothing for a root the plan did not check', () => {
    const row = moduleRow(mod({ cardKeyPrefix: 'added' }), plan(), []);
    expect(row.latestCompatible).toBeNull();
    expect(row.upToDate).toBe(false);
  });
});

describe('rangeFor / bindingScope / bindingOf', () => {
  it.each<{
    version: string;
    binding: Binding;
    range: string;
    scope: string;
  }>([
    { version: '1.2.3', binding: 'exact', range: '1.2.3', scope: '1.2.3 only' },
    { version: '1.2.3', binding: 'minor', range: '~1.2.3', scope: '1.2.x' },
    { version: '1.2.3', binding: 'major', range: '^1.2.3', scope: '1.x' },
    { version: '0.3.1', binding: 'major', range: '^0.3.1', scope: '0.3.x' },
    {
      version: '0.0.3',
      binding: 'major',
      range: '^0.0.3',
      scope: '0.0.3 only',
    },
  ])('$version $binding', ({ version, binding, range, scope }) => {
    expect(rangeFor(version, binding)).toBe(range);
    expect(bindingScope(version, binding)).toBe(scope);
    expect(bindingOf(range)).toBe(binding);
  });
});

describe('newestMatching', () => {
  const versions = ['2.1.0', '2.0.0', '1.9.0', '1.4.3', '0.3.2'];
  it.each<{ range: string; newest?: string }>([
    { range: '^1.4.3', newest: '1.9.0' },
    { range: '~1.4.3', newest: '1.4.3' },
    { range: '1.4.3', newest: '1.4.3' },
    { range: '^0.3.1', newest: '0.3.2' },
    { range: '^3.0.0' },
  ])('$range', ({ range, newest }) => {
    expect(newestMatching(versions, range)).toBe(newest);
  });
});

describe('submitDecision', () => {
  const base: SubmitInput = {
    mode: 'install',
    source: 'https://host/x.git',
    listing: 'versions',
    version: '2.0.0',
    binding: 'major',
  };
  it.each<{
    name: string;
    over: Partial<SubmitInput>;
    canSubmit: boolean;
    range?: string;
  }>([
    { name: 'listing error', over: { listing: 'error' }, canSubmit: false },
    { name: 'loading', over: { listing: 'loading' }, canSubmit: false },
    {
      name: 'source changed since listing',
      over: { listing: 'stale' },
      canSubmit: false,
    },
    { name: 'empty source', over: { source: ' ' }, canSubmit: false },
    {
      name: 'credentials',
      over: { source: 'https://u:t@host/x.git' },
      canSubmit: false,
    },
    { name: 'default binding', over: {}, canSubmit: true, range: '^2.0.0' },
    { name: 'tagless install', over: { listing: 'empty' }, canSubmit: true },
    {
      name: 'tagless change',
      over: { listing: 'empty', mode: 'change' },
      canSubmit: false,
    },
    {
      name: 'change without source',
      over: { mode: 'change', source: '' },
      canSubmit: true,
      range: '^2.0.0',
    },
  ])('$name', ({ over, canSubmit, range }) => {
    const state = submitDecision({ ...base, ...over });
    expect(state.canSubmit).toBe(canSubmit);
    expect(state.range).toBe(range);
  });
});

describe('version choices', () => {
  it('lists no versions below the installed one when changing', () => {
    const all = ['2.0.0', '1.3.0', '1.0.0'];
    expect(selectableVersions(all, '1.3.0')).toEqual(['2.0.0', '1.3.0']);
    expect(selectableVersions(all, '2.0.0')).toEqual(['2.0.0']);
  });

  it('prefers the newest stable version, else the newest listed', () => {
    expect(newestStable(['2.0.0-rc.1', '1.3.0', '1.0.0'])).toBe('1.3.0');
    expect(newestStable(['2.0.0-rc.1', '1.0.0-beta'])).toBe('2.0.0-rc.1');
  });
});
