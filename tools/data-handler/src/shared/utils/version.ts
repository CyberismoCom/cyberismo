// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import semver from 'semver';

import { ModuleRequestError } from '../exceptions/index.js';

// ---------------------------------------------------------------------------
// Value types
// ---------------------------------------------------------------------------

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

/**
 * Validate that `range` parses as a semver range and return it unchanged.
 * The round-trip preserves whatever form the user wrote (`^1.0.0`, `~1.2`,
 * `>=1 <2`, …) so `cardsConfig.json` and error messages stay readable.
 * @throws if `range` is not a valid semver range.
 */
export function toVersionRange(range: string): VersionRange {
  if (semver.validRange(range) === null) {
    throw new Error(`Invalid semver range: ${range}`);
  }
  return range as VersionRange;
}

/**
 * A range to declare, trimmed. Blank input is refused: `semver.validRange`
 * reads it as `*`, which would unpin.
 */
export function toDeclaredRange(input: string): VersionRange {
  const trimmed = input.trim();
  if (trimmed === '') {
    throw new ModuleRequestError('Version range cannot be empty');
  }
  try {
    return toVersionRange(trimmed);
  } catch (error) {
    throw new ModuleRequestError((error as Error).message);
  }
}

/**
 * Range assumed for a dependency declared without a version: bound to 1.x,
 * never floated across majors. Compat guard for configs written before
 * version support existed.
 *
 * The assumption is meant to be temporary. Wherever it governs a project's
 * own declaration, the next module operation writes it into
 * `cardsConfig.json`, so a config only stays version-less until it is next
 * touched. Dependency edges inside an installed module's own config are not
 * rewritten — that file belongs to the module, not the project.
 */
export const DEFAULT_VERSION_RANGE = '1.x' as VersionRange;

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

/** Pick the highest valid semver version from `available`. */
export function pickVersion(available: string[]): Version | undefined {
  const sorted = available
    .filter((candidate) => semver.valid(candidate) !== null)
    .sort(semver.rcompare);
  const best = sorted[0];
  return best ? toVersion(best) : undefined;
}

/**
 * Whether moving up from `from` to `to` leaves the caret range of `from`,
 * i.e. may break: a major bump, or a minor bump below 1.0.0. Downgrades never
 * reach it; the solver refuses them.
 */
export function isBreakingMove(from: string, to: string): boolean {
  return !semver.satisfies(to, `^${from}`);
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
