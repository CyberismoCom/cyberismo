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

import semver from 'semver';
import type { UpdatePlan } from '@cyberismo/data-handler';
import type { ProjectModule } from './api/types';

export interface ModuleRow {
  // A transitive module is decided by the modules that require it.
  actions: { update: boolean; remove: boolean; changeVersion: boolean };
  managedBy?: string[];
  latestCompatible?: string;
  latestAvailable?: string;
  heldBack: boolean;
  upToDate: boolean;
  // A private root without credentials; its latest versions are unknown.
  unchecked: boolean;
  blocked: boolean;
}

// What a module row shows, given the joint update plan if one was fetched.
export function moduleRow(
  module: ProjectModule,
  plan?: UpdatePlan,
  all: ProjectModule[] = [],
): ModuleRow {
  const row: ModuleRow = {
    actions: {
      update: module.isRoot,
      remove: module.isRoot,
      // Only a public git source can be listed and re-declared from here.
      changeVersion: module.isRoot && module.versionSource === 'git',
    },
    heldBack: false,
    upToDate: false,
    unchecked: false,
    blocked: plan?.ok === false,
  };
  if (!module.isRoot) {
    const nameOf = (prefix: string) =>
      all.find((m) => m.cardKeyPrefix === prefix)?.name ?? prefix;
    row.managedBy = module.parents.map(nameOf);
    return row;
  }
  if (!plan?.ok) return row;
  const change = plan.changes.find((c) => c.module === module.cardKeyPrefix);
  const root = plan.roots.find((r) => r.module === module.cardKeyPrefix);
  if (!root) return row;
  row.latestCompatible =
    change?.to ?? root.installed ?? module.installedVersion;
  row.latestAvailable = root.latest ?? undefined;
  row.heldBack = root.heldBack;
  row.unchecked = root.unchecked === true;
  row.upToDate = change === undefined;
  return row;
}

export type Binding = 'exact' | 'minor' | 'major';
export type Listing =
  'idle' | 'loading' | 'error' | 'stale' | 'empty' | 'versions';

const core = (version: string) => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

// -1, 0 or 1; versions that do not parse compare equal.
const compare = (a: string, b: string) => {
  const [x, y] = [core(a), core(b)];
  if (!x || !y) return 0;
  return Math.sign(x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
};

// The binding a declared range expresses; an absent or other range counts as ^.
export const bindingOf = (range?: string): Binding =>
  range?.startsWith('~')
    ? 'minor'
    : range && /^\d/.test(range)
      ? 'exact'
      : 'major';

export const rangeFor = (version: string, binding: Binding) =>
  binding === 'exact'
    ? version
    : `${binding === 'minor' ? '~' : '^'}${version}`;

// The version a newly declared range installs: the solver takes the newest
// listed version that satisfies it.
export const newestMatching = (versions: string[], range: string) =>
  semver.maxSatisfying(versions, range) ?? undefined;

// What the range from rangeFor admits, in words ('^0.3.1' is 0.3.x, not 0.x).
export function bindingScope(version: string, binding: Binding) {
  const [major, minor] = core(version) ?? [];
  if (major === undefined || binding === 'exact') return `${version} only`;
  if (binding === 'minor') return `${major}.${minor}.x`;
  if (major > 0) return `${major}.x`;
  return minor > 0 ? `0.${minor}.x` : `${version} only`;
}

// The engine never downgrades, so a change lists nothing below what is installed.
export const selectableVersions = (
  mode: 'install' | 'change',
  versions: string[],
  installed?: string,
) =>
  mode === 'change' && installed
    ? versions.filter((v) => compare(v, installed) >= 0)
    : versions;

// Credentials in a source would end up in cardsConfig.json and request logs.
export function sourceHasCredentials(source: string) {
  try {
    const url = new URL(source);
    return Boolean(url.username || url.password);
  } catch {
    return false;
  }
}

export interface SubmitInput {
  mode: 'install' | 'change';
  // What the user typed; unused when changing an installed module.
  source: string;
  listing: Listing;
  version?: string;
  binding: Binding;
}

// Submitting needs a settled listing; only a repository without tags installs
// without a range (as the CLI does).
export function submitState(input: SubmitInput): {
  canSubmit: boolean;
  range?: string;
} {
  const { mode, source, listing, version, binding } = input;
  const sourceOk =
    mode === 'change' ||
    (source.trim() !== '' && !sourceHasCredentials(source));
  if (!sourceOk) return { canSubmit: false };
  if (listing === 'empty') return { canSubmit: mode === 'install' };
  if (listing !== 'versions' || !version) return { canSubmit: false };
  return { canSubmit: true, range: rangeFor(version, binding) };
}
