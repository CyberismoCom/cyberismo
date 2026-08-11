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

import type { ResolveConflict } from './types.js';

/**
 * One-line human-readable explanation of a {@link ResolveConflict}, shared by
 * resolution error messages and the check-updates listing.
 */
export function conflictReason(c: ResolveConflict): string {
  if (c.downgrade)
    return `cannot downgrade from ${c.downgrade.from} to ${c.downgrade.to} (downgrading is not supported)`;
  const parts: string[] = [];
  if (c.demands.length)
    parts.push(
      c.demands.map((d) => `${d.from} requires ${d.range}`).join(', '),
    );
  // Named separately from the demands because this is the one blocker the
  // project itself can lift.
  if (c.pinned)
    parts.push(
      `declared as '${c.pinned.range}' in this project, but ${c.pinned.wouldNeed} is needed`,
    );
  if (c.nonReplayable)
    parts.push(
      `no migration path from installed ${c.nonReplayable.from} to ${c.nonReplayable.to}`,
    );
  return parts.length
    ? parts.join('; ')
    : 'no version satisfies its constraints';
}
