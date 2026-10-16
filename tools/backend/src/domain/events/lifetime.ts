// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
