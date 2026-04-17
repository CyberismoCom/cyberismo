/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2024

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import semver from 'semver';

/** A single version constraint declared by one dependent. */
export interface VersionConstraint {
  /** Semver range string, e.g., "^1.0.0" */
  range: string;
  /** Name of the module that declared this constraint */
  source: string;
}

/**
 * Resolves the best version for each module given all constraints and available versions.
 *
 * @param constraintMap - Map of module name to all version constraints from dependents
 * @param availableVersionsMap - Map of module name to available remote versions (sorted descending)
 * @returns Map of module name to resolved version string
 * @throws On incompatible ranges or no available version matching constraints
 */
export function resolveModuleVersions(
  constraintMap: Map<string, VersionConstraint[]>,
  availableVersionsMap: Map<string, string[]>,
): Map<string, string> {
  const resolved = new Map<string, string>();

  for (const [moduleName, constraints] of constraintMap) {
    if (constraints.length === 0) {
      continue;
    }

    const availableVersions = availableVersionsMap.get(moduleName) ?? [];

    // Validate each individual range
    for (const constraint of constraints) {
      if (!semver.validRange(constraint.range)) {
        throw new Error(
          `Invalid version range '${constraint.range}' for module '${moduleName}' (declared by ${constraint.source})`,
        );
      }
    }

    // Check pairwise compatibility for targeted error messages
    for (let i = 0; i < constraints.length; i++) {
      for (let j = i + 1; j < constraints.length; j++) {
        if (!semver.intersects(constraints[i].range, constraints[j].range)) {
          throw new Error(
            formatVersionConflictError(moduleName, [
              constraints[i],
              constraints[j],
            ]),
          );
        }
      }
    }

    // Combine all ranges (semver AND semantics: space-separated)
    const combinedRange = constraints.map((c) => c.range).join(' ');
    if (!semver.validRange(combinedRange)) {
      throw new Error(formatVersionConflictError(moduleName, constraints));
    }

    if (availableVersions.length === 0) {
      throw new Error(
        `No available versions found for module '${moduleName}'.\n` +
          formatConstraintList(constraints),
      );
    }

    // Pick the highest version satisfying all constraints
    const best = semver.maxSatisfying(availableVersions, combinedRange);
    if (!best) {
      throw new Error(
        `No available version satisfies all constraints for module '${moduleName}':\n` +
          formatConstraintList(constraints) +
          `  Combined constraint: ${semver.validRange(combinedRange)}\n` +
          `  Available versions: ${availableVersions.join(', ')}\n`,
      );
    }

    resolved.set(moduleName, best);
  }

  return resolved;
}

/**
 * Validates that a specific version satisfies all existing constraints.
 *
 * @param version - The concrete version to validate
 * @param constraints - All version constraints that must be satisfied
 * @throws If the version does not satisfy one or more constraints
 */
export function validateVersionAgainstConstraints(
  moduleName: string,
  version: string,
  constraints: VersionConstraint[],
): void {
  for (const constraint of constraints) {
    if (!semver.satisfies(version, constraint.range)) {
      throw new Error(
        `Version '${version}' for module '${moduleName}' does not satisfy constraint '${constraint.range}' (required by ${constraint.source})`,
      );
    }
  }
}

function formatConstraintList(constraints: VersionConstraint[]): string {
  return constraints
    .map((c) => `  - ${c.range} (required by ${c.source})\n`)
    .join('');
}

function formatVersionConflictError(
  moduleName: string,
  constraints: VersionConstraint[],
): string {
  return (
    `Incompatible version requirements for module '${moduleName}':\n` +
    formatConstraintList(constraints) +
    `These ranges have no overlap.`
  );
}
