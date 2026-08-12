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

import type { ModuleUpdateStatus } from '@cyberismo/data-handler';

/** `(2.0.0 available outside '^1.0.0')` — empty when nothing is held back. */
function heldBackNotice(mod: ModuleUpdateStatus): string {
  return mod.latestAvailable
    ? `${mod.latestAvailable.version} available outside '${mod.latestAvailable.range}'`
    : '';
}

/** One listing line for a check-updates row. */
export function checkUpdatesRow(mod: ModuleUpdateStatus): string {
  switch (mod.status) {
    case 'up_to_date': {
      if (!mod.isGitModule) return `  ${mod.name}    (local module)`;
      const heldBack = heldBackNotice(mod);
      return `  ${mod.name}    ${mod.installedVersion ?? 'unknown'}  (up to date${heldBack ? `; ${heldBack}` : ''})`;
    }
    case 'update_available': {
      const cascadeOthers = (mod.cascade ?? [])
        .filter((c) => c.module !== mod.name)
        .map((c) => c.module);
      const suffixes = [
        ...(cascadeOthers.length > 0
          ? [`(also updates: ${cascadeOthers.join(', ')})`]
          : []),
        ...(mod.latestAvailable ? [`(${heldBackNotice(mod)})`] : []),
      ]
        .map((s) => `  ${s}`)
        .join('');
      return `  ${mod.name}    ${mod.installedVersion ?? 'unversioned'}  →  ${mod.reachableVersion}${suffixes}`;
    }
    case 'blocked': {
      // Name the module each reason belongs to: the blocker is often a
      // transitive dep, not the row being reported.
      const reasons = (mod.conflicts ?? [])
        .map((c) => `${c.module}: ${c.reason}`)
        .join('; ');
      return `  ${mod.name}    blocked${reasons ? `  ${reasons}` : ''}`;
    }
    case 'source_unreachable':
      return `  ${mod.name}    (source unreachable)`;
    default: {
      // A status this renderer has not been taught must still appear in
      // the listing rather than vanishing from it.
      const unhandled: never = mod.status;
      return `  ${mod.name}    (${String(unhandled)})`;
    }
  }
}

/**
 * Trailing summary lines for a check-updates listing. "All modules are up to
 * date" is claimed only when nothing is updatable, blocked, unreachable, or
 * held back by its declared range.
 */
export function checkUpdatesSummary(updates: ModuleUpdateStatus[]): string[] {
  const count = (status: ModuleUpdateStatus['status']) =>
    updates.filter((m) => m.status === status).length;
  const updatable = count('update_available');
  const blocked = count('blocked');
  const unreachable = count('source_unreachable');
  const heldBack = updates.filter((m) => m.latestAvailable).length;

  const lines: string[] = [];
  if (updatable > 0) {
    lines.push(`${updatable} module(s) have updates available.`);
  }
  if (blocked > 0) {
    lines.push(
      `${blocked} module(s) are blocked — resolve conflicts before upgrading.`,
    );
  }
  if (unreachable > 0) {
    lines.push(
      `${unreachable} module(s) could not be checked (source unreachable).`,
    );
  }
  if (heldBack > 0) {
    lines.push(
      `${heldBack} module(s) held back by their declared range — edit the range in cardsConfig.json to allow the newer version.`,
    );
  }
  if (lines.length === 0) {
    lines.push('All modules are up to date.');
  }
  return lines;
}
