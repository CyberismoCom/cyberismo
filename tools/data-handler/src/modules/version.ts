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

/** Pure semver helpers used by the module system. */

/** Prefix used on git tags to mark a semver release, e.g. `v1.2.3`. */
export const TAG_PREFIX = 'v';

/** Convert a semver version to a git tag name (prefixes with `v`). */
export function versionToTag(version: Version | string): string {
  return `${TAG_PREFIX}${version}`;
}

/** Strip the tag prefix; returns input unchanged if the prefix is absent. */
export function stripTagPrefix(tag: string): string {
  return tag.startsWith(TAG_PREFIX) ? tag.substring(TAG_PREFIX.length) : tag;
}

/** Pick the highest version from `available` that satisfies `range`. */
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
 * Validates that `version` satisfies every range in `constraints`.
 * Throws if any constraint is not satisfied.
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
