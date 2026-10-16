// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ResolveConflict } from './types.js';

/**
 * One-line human-readable explanation of a {@link ResolveConflict}, shared by
 * resolution error messages and the dry-run plan.
 */
export function conflictReason(c: ResolveConflict): string {
  const parts: string[] = [];
  // A downgrade often coexists with a pin block (installed drifted above the
  // range: everything below is a downgrade, everything above breaks the pin),
  // so it joins the other parts instead of replacing them.
  if (c.downgrade)
    parts.push(
      `cannot downgrade from ${c.downgrade.from} to ${c.downgrade.to} (downgrading is not supported)`,
    );
  if (c.demands.length)
    parts.push(
      c.demands.map((d) => `${d.from} requires ${d.range}`).join(', '),
    );
  // Named separately from the demands because this is the one blocker the
  // project itself can lift.
  if (c.pinned)
    parts.push(
      c.pinned.assumed
        ? `no version declared in this project (assumed '${c.pinned.range}'); a version outside it may be needed`
        : `declared as '${c.pinned.range}' in this project; a version outside it may be needed`,
    );
  if (c.nonReplayable)
    parts.push(
      `no migration path from installed ${c.nonReplayable.from} to ${c.nonReplayable.to}`,
    );
  return parts.length
    ? parts.join('; ')
    : 'no version satisfies its constraints';
}
