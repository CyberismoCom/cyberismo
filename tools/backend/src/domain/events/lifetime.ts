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

const MAX_LIFETIME_MS = 30 * 60_000;
const ROTATION_MARGIN_MS = 30_000;

/** Rotation deadline in ms from now. */
export function computeLifetimeMs(exp: number, now = Date.now()): number {
  const jittered = MAX_LIFETIME_MS * (0.6 + Math.random() * 0.4);
  const remaining = exp * 1000 - now;
  // Jitter may only shorten: the token `exp` clamp is hard.
  const untilExpiry =
    remaining > ROTATION_MARGIN_MS
      ? remaining - ROTATION_MARGIN_MS
      : Math.max(remaining, 0);
  return Math.min(untilExpiry, jittered);
}
