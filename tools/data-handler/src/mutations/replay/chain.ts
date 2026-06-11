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

/**
 * Linearity = the installed tree's seal set is a subset of the target
 * tree's (the consumer's chain is a prefix of the target's chain).
 * @returns file names the target is missing; empty means linear.
 */
export function checkLinearity(
  installedSeals: SealFile[],
  targetSeals: SealFile[],
): string[] {
  const targetNames = new Set(targetSeals.map((s) => s.fileName));
  return installedSeals
    .filter((s) => !targetNames.has(s.fileName))
    .map((s) => s.fileName);
}

/**
 * Target-tree seals to replay for an update from `from` to `to`:
 * those with `to` in (from, to], ascending, linked end-to-end. The first
 * seal's lower bound may sit at or below `from` (clean releases seal
 * nothing).
 * @throws on a gap — a corrupt module tree.
 */
export function computeChain(
  targetSeals: SealFile[],
  from: string,
  to: string,
): SealFile[] {
  const chain = targetSeals
    .filter((s) => semver.gt(s.to, from) && semver.lte(s.to, to))
    .sort((a, b) => semver.compare(a.to, b.to));

  if (chain.length === 0) return [];

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
  return chain;
}
