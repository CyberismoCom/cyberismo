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
  // Only root modules are managed directly; a transitive one follows its parents.
  actions: { update: boolean; remove: boolean; changeVersion: boolean };
  // Names of the modules that pull this one in; set only for a transitive module.
  managedBy?: string[];
  // Newest version the declared range admits; null until an update check covers this module.
  latestCompatible: string | null;
  // Newest release overall; set only when it is newer than latestCompatible.
  latestAvailable: string | null;
  // The newest release lies outside the declared range.
  heldBack: boolean;
  // Nothing to update; false also when the module has not been checked.
  upToDate: boolean;
  // Range the update assumes when the module declares none.
  assumedRange: string | null;
}

export const moduleName = (all: ProjectModule[], prefix: string) =>
  all.find((m) => m.cardKeyPrefix === prefix)?.name ?? prefix;

// Changes whenever anything an update plan depends on changes.
export const modulesSignature = (modules: ProjectModule[] = []) =>
  modules
    .map(
      (m) =>
        `${m.cardKeyPrefix}@${m.installedVersion}:${m.declaredRange}:${m.isRoot}`,
    )
    .sort()
    .join(',');

// What a module row shows, given the joint update plan if one was fetched.
export function moduleRow(
  module: ProjectModule,
  plan: UpdatePlan | undefined,
  all: ProjectModule[],
): ModuleRow {
  const row: ModuleRow = {
    actions: {
      update: module.isRoot,
      remove: module.isRoot,
      // Only a public git source can be listed and re-declared from here.
      changeVersion: module.isRoot && module.versionSource === 'git',
    },
    latestCompatible: null,
    latestAvailable: null,
    assumedRange: null,
    heldBack: false,
    upToDate: false,
  };
  if (!module.isRoot) {
    row.managedBy = module.parents.map((p) => moduleName(all, p));
    return row;
  }
  if (!plan?.ok) return row;
  const change = plan.changes.find((c) => c.module === module.cardKeyPrefix);
  const root = plan.roots.find((r) => r.module === module.cardKeyPrefix);
  if (!root) return row;
  row.latestCompatible = change?.to ?? root.installed;
  if (root.latest !== row.latestCompatible) row.latestAvailable = root.latest;
  if (!module.declaredRange) row.assumedRange = root.range;
  row.heldBack = root.heldBack;
  row.upToDate = change === undefined;
  return row;
}

export type Binding = 'exact' | 'minor' | 'major';
export type Listing =
  'idle' | 'loading' | 'error' | 'stale' | 'empty' | 'versions';

// The binding a declared range expresses; an absent or other range counts as ^.
export function bindingOf(range?: string): Binding {
  if (range?.startsWith('~')) return 'minor';
  if (range && /^\d/.test(range)) return 'exact';
  return 'major';
}

const RANGE_PREFIX: Record<Binding, string> = {
  exact: '',
  minor: '~',
  major: '^',
};

export const rangeFor = (version: string, binding: Binding) =>
  RANGE_PREFIX[binding] + version;

// The default pick: the newest version that is not a prerelease.
export const newestStable = (versions: string[]) =>
  versions.find((v) => !semver.prerelease(v)) ?? versions[0];

// The version a newly declared range installs: the solver takes the newest
// listed version that satisfies it.
export const newestMatching = (versions: string[], range: string) =>
  semver.maxSatisfying(versions, range) ?? undefined;

// What the range from rangeFor admits, in words ('^0.3.1' is 0.3.x, not 0.x).
export function bindingScope(version: string, binding: Binding) {
  const parsed = semver.coerce(version);
  if (!parsed || binding === 'exact') return `${version} only`;
  const { major, minor } = parsed;
  if (binding === 'minor') return `${major}.${minor}.x`;
  if (major > 0) return `${major}.x`;
  return minor > 0 ? `0.${minor}.x` : `${version} only`;
}

// The engine never downgrades, so with an installed version nothing below it
// is listed; versions that do not parse are kept.
export function selectableVersions(versions: string[], installed?: string) {
  const floor = installed && semver.coerce(installed);
  if (!floor) return versions;
  return versions.filter((v) => {
    const parsed = semver.coerce(v);
    return !parsed || semver.gte(parsed, floor);
  });
}

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
