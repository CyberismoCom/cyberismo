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

/**
 * Trailing summary lines for a check-updates listing. "All modules are up to
 * date" is claimed only when nothing is updatable, blocked, or unreachable.
 */
export function checkUpdatesSummary(updates: ModuleUpdateStatus[]): string[] {
  const count = (status: ModuleUpdateStatus['status']) =>
    updates.filter((m) => m.status === status).length;
  const updatable = count('update_available');
  const blocked = count('blocked');
  const unreachable = count('source_unreachable');

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
  if (lines.length === 0) {
    lines.push('All modules are up to date.');
  }
  return lines;
}
