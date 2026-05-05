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

// Git environment settings that keep clone/ls-remote/push non-interactive.
// `GIT_TERMINAL_PROMPT=0` suppresses the credential prompt and
// `GCM_INTERACTIVE=never` opts out of Git Credential Manager popups.
export const NON_INTERACTIVE_GIT_ENV = {
  GIT_TERMINAL_PROMPT: 0,
  GCM_INTERACTIVE: 'never',
} as const;

/** 15s base, doubled in CI, plus a 50% bump on Windows. */
export function gitTimeout(): number {
  const baseTimeout = 15000;
  const isCI = process.env.CI;
  const isWindows = process.platform === 'win32';

  let timeout = baseTimeout;
  if (isCI) timeout *= 2;
  if (isWindows) timeout *= 1.5;

  return timeout;
}
