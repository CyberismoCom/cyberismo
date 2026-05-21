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

import type { ReplayConflict } from './types.js';

export interface ConflictDetectionInput {
  modulePrefix: string;
  fromVersion: string | null;
  toVersion: string;
  /** All sealed log versions known for this module, in any order. */
  availableSealedVersions: string[];
}

/**
 * v1 heuristic for diverged-branch detection.
 *
 * Refuses cross-major updates when the consumer's `fromVersion` sits at the
 * top of its major branch — i.e., there is no sealed log on the same major
 * that is strictly greater than `fromVersion`. In that case, the linear path
 * `fromVersion → … → toVersion` is missing the bridging release(s), so we
 * treat the path as unreachable and ask the consumer to roll back to an
 * earlier known-good version on the from-major. Cross-major hotfix DAG
 * analysis is deferred.
 */
export function detectMigrationPathConflicts(
  input: ConflictDetectionInput,
): ReplayConflict[] {
  const { modulePrefix, fromVersion, toVersion, availableSealedVersions } =
    input;
  if (!fromVersion) return []; // Bootstrap — no chain needed.

  const fromMajor = semver.major(fromVersion);
  const toMajor = semver.major(toVersion);

  // Same-major chain: no conflict (linear).
  if (fromMajor === toMajor) return [];

  // Cross-major. Find the highest sealed version on the from-major branch.
  const onFromMajor = availableSealedVersions
    .filter((v) => semver.valid(v) !== null && semver.major(v) === fromMajor)
    .sort(semver.compare);

  const maxOnFromMajor = onFromMajor.at(-1);

  // If there is a higher release on the from-major than `fromVersion`, there
  // is still a linear path forward (we can climb that major before crossing).
  if (maxOnFromMajor && semver.gt(maxOnFromMajor, fromVersion)) return [];

  // Otherwise the from-version sits at (or above) the tip of its major
  // branch and we cannot bridge to the next major without diverged-branch
  // analysis. Suggest the largest version on the from-major that is at most
  // fromVersion (excluding fromVersion itself when possible).
  const suggestion = onFromMajor
    .filter((v) => semver.lt(v, fromVersion))
    .at(-1);

  return [
    {
      kind: 'migration_path_unreachable',
      affected: modulePrefix,
      location: `${fromVersion} → ${toVersion}`,
      description:
        `Cannot update ${modulePrefix} from ${fromVersion} to ${toVersion}: ` +
        `version ${fromVersion} is on a branch that diverged from the path to ${toVersion}. ` +
        `Move to ${suggestion ?? '(an earlier version)'} first, or pick a newer ${toMajor}.x.`,
      suggestedTargetVersion: suggestion,
      suggestedIntermediateVersions: [],
    },
  ];
}
