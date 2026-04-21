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

/**
 * TypeScript mirrors of the entities and value types defined in
 * `module-system.allium`. These types are pure data — they carry no
 * behaviour and intentionally model the spec's shape rather than the
 * legacy `ModuleSetting` shape that persists in `cardsConfig.json`.
 */

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

/**
 * A location a module can be fetched from, together with whether it
 * requires credentialed access.
 *
 * `location` is either a git remote URL (https://… or git@…) or a file
 * URL (`file:<path>`). `private` defaults to false when absent.
 */
export interface Source {
  location: string;
  private?: boolean;
}

/**
 * A concrete semver version such as `"1.2.3"`. Represented as a branded
 * string so that TypeScript distinguishes it from arbitrary strings at
 * compile time while keeping the runtime representation as lightweight
 * as possible.
 *
 * Construct via {@link toVersion}, which validates the input against
 * `semver`.
 */
export type Version = string & { readonly __brand: 'Version' };

/**
 * A semver range such as `"^1.0.0"` or `">=1.0 <2.0"`. A bare version
 * (`"1.2.3"`) is interpreted by semver as an exact pin (`=1.2.3`).
 * Represented as a branded string — see {@link Version}.
 *
 * Construct via {@link toVersionRange}, which validates the input as a
 * semver range.
 */
export type VersionRange = string & { readonly __brand: 'VersionRange' };

/**
 * Coerce a raw string into a {@link Version}. Throws if `value` is not
 * a valid semver version.
 */
export function toVersion(value: string): Version {
  const normalized = semver.valid(value);
  if (normalized === null) {
    throw new Error(`Invalid semver version: ${value}`);
  }
  return normalized as Version;
}

/**
 * Coerce a raw string into a {@link VersionRange}. Throws if `range` is
 * not a valid semver range.
 */
export function toVersionRange(range: string): VersionRange {
  const normalized = semver.validRange(range);
  if (normalized === null) {
    throw new Error(`Invalid semver range: ${range}`);
  }
  return normalized as VersionRange;
}

/**
 * Outcome of querying a remote for available versions. Tolerant: if the
 * remote is unreachable, `reachable` is false and the version fields are
 * absent — `CheckUpdates` still produces a report row instead of aborting.
 */
export interface RemoteQueryOutcome {
  reachable: boolean;
  latest?: Version;
  latestSatisfying?: Version;
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

/**
 * Lightweight reference to a {@link ModuleInstallation}. Used for the
 * `parent` field of transitive declarations to avoid a circular type
 * dependency between `ModuleDeclaration` and `ModuleInstallation`.
 *
 * `project` is the project's base path, matching how projects are
 * identified throughout the codebase.
 */
export interface InstallationRef {
  project: string;
  name: string;
}

/**
 * Persisted record in the project's `cardsConfig.json`. Represents the
 * caller's intent: "this project wants this module at this range".
 *
 * Top-level declarations have `parent` absent and are created/removed by
 * the `import`/`remove` commands. Transitive declarations have `parent`
 * set to the installation that owns them; they are derived from the
 * owning installation's `cardsConfig.json` and appear/disappear as that
 * installation is installed or replaced.
 */
export interface ModuleDeclaration {
  project: string;
  name: string;
  source: Source;
  versionRange?: VersionRange;
  parent?: InstallationRef;
}

/**
 * Module files present under `.cards/modules/<name>/`. There is at most
 * one installation per (project, name) — module prefixes are a global
 * namespace, so two versions of `"base"` cannot coexist in one project.
 *
 * `path` is the absolute filesystem path of the installed module.
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

/**
 * Per-module status emitted by `CheckUpdates`. Mirrors the `status` enum
 * on the `ModuleCheckReport` entity in `module-system.allium`.
 */
export type CheckStatus =
  | 'up_to_date'
  | 'update_available'
  | 'range_blocks_update'
  | 'range_unsatisfiable'
  | 'source_unreachable'
  | 'drifted';

/**
 * Read-only per-module report produced by `CheckUpdates`. One row per
 * top-level project declaration inspected. Never mutates project state.
 */
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
 * Emitted by the resolver when a later transitive declaration's range
 * rejects a version already chosen for the same name. The first
 * resolution wins; the conflict is surfaced as a structured event so
 * that callers (CLI, web UI, MCP) can warn without aborting the whole
 * operation.
 *
 * `installedVersion` is a tagged union so that callers can distinguish
 * "first resolution pinned an exact version" from "first resolution
 * used the default branch because no version was pinned" without an
 * `undefined` sentinel.
 */
export interface DiamondVersionConflict {
  project: string;
  name: string;
  installedVersion: { kind: 'pinned'; value: Version } | { kind: 'unpinned' };
  rejectingRange: VersionRange;
  rejectingParent?: InstallationRef;
}
