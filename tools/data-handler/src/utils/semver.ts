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

export type BumpType = 'patch' | 'minor' | 'major';

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_REGEX = /^(\d+)\.(\d+)\.(\d+)$/;
const TAG_PREFIX = 'v';

/**
 * Parse a semver string into its components.
 * @param version String like "1.2.3"
 * @throws if the string is not a valid semver
 */
export function parseSemver(version: string): SemVer {
  const match = version.match(SEMVER_REGEX);
  if (!match) {
    throw new Error(`Invalid semver: "${version}"`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Format a SemVer object back to a string.
 */
export function formatSemver(ver: SemVer): string {
  return `${ver.major}.${ver.minor}.${ver.patch}`;
}

/**
 * Bump a semver string by the given type.
 * @param version Current version string (e.g. "1.2.3")
 * @param type Bump type: "patch", "minor", or "major"
 * @returns New version string
 */
export function bumpSemver(version: string, type: BumpType): string {
  const ver = parseSemver(version);
  switch (type) {
    case 'major':
      return formatSemver({ major: ver.major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatSemver({ major: ver.major, minor: ver.minor + 1, patch: 0 });
    case 'patch':
      return formatSemver({
        major: ver.major,
        minor: ver.minor,
        patch: ver.patch + 1,
      });
  }
}

/**
 * Convert a version string to a git tag name.
 * "1.2.3" → "v1.2.3"
 */
export function formatTag(version: string): string {
  return `${TAG_PREFIX}${version}`;
}

/**
 * Extract the version string from a git tag name.
 * "v1.2.3" → "1.2.3", returns null if not a valid version tag.
 */
export function parseTag(tag: string): string | null {
  if (!tag.startsWith(TAG_PREFIX)) return null;
  const version = tag.slice(TAG_PREFIX.length);
  return SEMVER_REGEX.test(version) ? version : null;
}

/**
 * Compare two semver strings. Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (av.major !== bv.major) return av.major - bv.major;
  if (av.minor !== bv.minor) return av.minor - bv.minor;
  return av.patch - bv.patch;
}
