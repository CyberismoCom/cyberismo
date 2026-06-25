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
import type { SealFile } from './seal-files.js';

/** @returns installed seals absent from the target; empty means linear. */
export function checkLinearity(
  installedSeals: SealFile[],
  targetSeals: SealFile[],
): string[] {
  const targetNames = new Set(targetSeals.map((s) => s.fileName));
  return installedSeals
    .filter((s) => !targetNames.has(s.fileName))
    .map((s) => s.fileName);
}

/** Two versions on the same minor line (differ only in patch). */
function sameMinorLine(a: string, b: string): boolean {
  return (
    semver.major(a) === semver.major(b) && semver.minor(a) === semver.minor(b)
  );
}

/**
 * Seals to replay for `from` → `to`: those with `to` in (from, to], ascending
 * and contiguous. `from` and `to` need not fall on seal boundaries.
 * @returns [] when the range crosses no seal boundary (no-op or patch jump).
 * @throws on a downgrade, a gap, or when the chain falls short of `to`.
 */
export function computeChain(
  targetSeals: SealFile[],
  from: string,
  to: string,
): SealFile[] {
  if (semver.lt(to, from)) {
    throw new Error(`Cannot replay a downgrade: ${to} is older than ${from}`);
  }

  const chain = targetSeals
    .filter((s) => semver.gt(s.to, from) && semver.lte(s.to, to))
    .sort((a, b) => semver.compare(a.to, b.to));

  if (chain.length === 0) {
    if (sameMinorLine(from, to)) return [];
    throw new Error(`Migration log gap: no seal bridges ${from} to ${to}`);
  }

  if (semver.gt(chain[0].from, from)) {
    throw new Error(
      `Migration log gap: chain starts at ${chain[0].fileName} but the update begins at ${from}`,
    );
  }
  for (let i = 1; i < chain.length; i++) {
    if (!semver.eq(chain[i].from, chain[i - 1].to)) {
      throw new Error(
        `Migration log gap between ${chain[i - 1].fileName} and ${chain[i].fileName}`,
      );
    }
  }
  if (!sameMinorLine(chain[chain.length - 1].to, to)) {
    throw new Error(
      `Migration log gap: chain ends at ${chain[chain.length - 1].fileName} but the update targets ${to}`,
    );
  }
  return chain;
}
