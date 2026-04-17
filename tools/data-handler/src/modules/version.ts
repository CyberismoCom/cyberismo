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

import { toVersion, type Version, type VersionRange } from './types.js';

/**
 * Pure semver helpers used by the module system. This file intentionally
 * contains no graph-wide constraint-intersection logic — per
 * `module-system.allium`, cross-graph version resolution is deferred to a
 * future ASP pass. The helpers here operate on a single declaration at a
 * time.
 */

/** Prefix used on git tags to mark a semver release, e.g. `v1.2.3`. */
export const TAG_PREFIX = 'v';

/**
 * Convert a semver version to a git tag name.
 *
 * Accepts either a branded {@link Version} or a raw string so that callers
 * which have not yet branded their value can still use this helper.
 *
 * @example versionToTag("1.2.3") // "v1.2.3"
 */
export function versionToTag(version: Version | string): string {
  return `${TAG_PREFIX}${version}`;
}

/**
 * Strip the tag prefix and return the version portion. If the tag does
 * not start with the prefix, it is returned unchanged.
 *
 * The return value is intentionally NOT branded as {@link Version}: the
 * caller is closer to the source of the string and decides whether it
 * should be trusted as valid semver.
 *
 * @example tagToVersion("v1.2.3") // "1.2.3"
 * @example tagToVersion("main")   // "main"
 */
export function tagToVersion(tag: string): string {
  return tag.startsWith(TAG_PREFIX) ? tag.substring(TAG_PREFIX.length) : tag;
}

/**
 * Pick the highest version from `available` that satisfies `range`. Thin
 * wrapper around `semver.maxSatisfying` with a couple of conventions:
 *
 * - An empty `available` list always returns `undefined`.
 * - An undefined `range` returns the highest valid version in the list
 *   (or `undefined` if none of the entries parse as semver).
 *
 * The result is branded as {@link Version} so that downstream code that
 * tracks branding does not need to re-validate.
 */
export function pickVersion(
  available: string[],
  range?: VersionRange | string,
): Version | undefined {
  if (available.length === 0) {
    return undefined;
  }
  if (range === undefined) {
    const sorted = [...available]
      .filter((candidate) => semver.valid(candidate) !== null)
      .sort(semver.rcompare);
    const best = sorted[0];
    return best ? toVersion(best) : undefined;
  }
  const best = semver.maxSatisfying(available, range);
  return best ? toVersion(best) : undefined;
}

/**
 * Returns true when `version` satisfies `range`. Thin wrapper over
 * `semver.satisfies` that accepts either branded or raw strings.
 */
export function satisfies(
  version: Version | string,
  range: VersionRange | string,
): boolean {
  return semver.satisfies(version, range);
}

/**
 * Throws a descriptive error when `version` does not satisfy `range`.
 * `context` is interpolated into the message so the caller can describe
 * where the constraint came from (e.g. the declaring module).
 *
 * Used by the "update to exact version X" path to block pinning to a
 * version that would violate an already-declared range.
 */
export function assertSatisfies(
  version: string,
  range: string,
  context: string,
): void {
  if (!semver.satisfies(version, range)) {
    throw new Error(
      `Version '${version}' does not satisfy range '${range}' (${context})`,
    );
  }
}

/**
 * Validates that a specific version satisfies all existing constraints.
 *
 * Kept from the (now deleted) `utils/version-resolver.ts` because the
 * `update <name> <exact-version>` path still needs to validate a pinned
 * version against every range already declared for that module. This
 * function does NOT compute a cross-graph intersection — it simply
 * checks each constraint in turn.
 *
 * @param moduleName Name of the module the version targets.
 * @param version The concrete version to validate.
 * @param constraints All version range constraints that must be satisfied.
 * @throws If the version does not satisfy one or more constraints.
 */
export function validateVersionAgainstConstraints(
  moduleName: string,
  version: string,
  constraints: { range: string; source: string }[],
): void {
  for (const constraint of constraints) {
    if (!semver.satisfies(version, constraint.range)) {
      throw new Error(
        `Version '${version}' for module '${moduleName}' does not satisfy constraint '${constraint.range}' (required by ${constraint.source})`,
      );
    }
  }
}
