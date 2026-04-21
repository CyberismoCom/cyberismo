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

import semver from 'semver';

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/** A location a module can be fetched from; `private` defaults to false. */
export interface Source {
  location: string;
  private?: boolean;
}

/** Branded concrete semver version (e.g. `"1.2.3"`). Construct via {@link toVersion}. */
export type Version = string & { readonly __brand: 'Version' };

/** Branded semver range (e.g. `"^1.0.0"`). Construct via {@link toVersionRange}. */
export type VersionRange = string & { readonly __brand: 'VersionRange' };

/** @throws if `value` is not a valid semver version. */
export function toVersion(value: string): Version {
  const normalized = semver.valid(value);
  if (normalized === null) {
    throw new Error(`Invalid semver version: ${value}`);
  }
  return normalized as Version;
}

/** @throws if `range` is not a valid semver range. */
export function toVersionRange(range: string): VersionRange {
  const normalized = semver.validRange(range);
  if (normalized === null) {
    throw new Error(`Invalid semver range: ${range}`);
  }
  return normalized as VersionRange;
}

/**
 * Outcome of querying a remote for available versions. Tolerant: when the
 * remote is unreachable, `reachable` is false and the version fields are absent.
 */
export interface RemoteQueryOutcome {
  reachable: boolean;
  latest?: Version;
  latestSatisfying?: Version;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/** Lightweight reference to a {@link ModuleInstallation} (avoids circular types). */
export interface InstallationRef {
  project: string;
  name: string;
}

/**
 * Persisted record in the project's `cardsConfig.json`: "this project wants
 * this module at this range". Top-level declarations have `parent` absent;
 * transitive declarations carry the owning installation as `parent`.
 */
export interface ModuleDeclaration {
  project: string;
  name: string;
  source: Source;
  versionRange?: VersionRange;
  parent?: InstallationRef;
  /**
   * Optional absolute path to a directory the caller has already fetched
   * for this declaration. When present (and the directory still exists),
   * the resolver treats it as the staged clone and skips its own fetch.
   */
  stagedPath?: string;
}

/**
 * Module files present under `.cards/modules/<name>/`. At most one
 * installation per (project, name) — module prefixes are a global namespace.
 */
export interface ModuleInstallation {
  project: string;
  name: string;
  source: Source;
  version?: Version;
  path: string;
}

// ---------------------------------------------------------------------------
// Check-updates reporting
// ---------------------------------------------------------------------------

/** Per-module status emitted by `CheckUpdates`. */
export type CheckStatus =
  | 'up_to_date'
  | 'update_available'
  | 'range_blocks_update'
  | 'range_unsatisfiable'
  | 'source_unreachable'
  | 'drifted';

/** Read-only per-module report produced by `CheckUpdates`. */
export interface ModuleCheckReport {
  project: string;
  declaration: ModuleDeclaration;
  installation?: ModuleInstallation;
  latestVersion?: Version;
  latestSatisfying?: Version;
  status: CheckStatus;
}

// ---------------------------------------------------------------------------
// Transitive resolution diagnostics
// ---------------------------------------------------------------------------

/**
 * Emitted by the resolver when a later transitive declaration's range rejects
 * a version already chosen for the same name. First resolution wins; the
 * conflict surfaces as a structured event instead of aborting.
 */
export interface DiamondVersionConflict {
  project: string;
  name: string;
  installedVersion: { kind: 'pinned'; value: Version } | { kind: 'unpinned' };
  rejectingRange: VersionRange;
  rejectingParent?: InstallationRef;
}
