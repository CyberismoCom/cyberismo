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

import { simpleGit, type SimpleGit } from 'simple-git';

// Suppress the credential prompt and Git Credential Manager popups.
let nonInteractiveApplied = false;

/**
 * Build a git client that cannot prompt.
 *
 * The flags go on `process.env`, not simple-git's `.env()`: that *replaces* the
 * child environment rather than extending it, stripping GIT_SSH_COMMAND,
 * SSH_AUTH_SOCK and GIT_CONFIG_* — and simple-git refuses to forward those
 * anyway. Inherited environment is the only route that carries them.
 */
export function createGit(options?: {
  /**
   * Repository the command runs inside. Omit for `clone` and `ls-remote`;
   * simple-git otherwise falls back to `process.cwd()`, a different repo.
   */
  baseDir?: string;
  timeout?: number;
  config?: string[];
}): SimpleGit {
  if (!nonInteractiveApplied) {
    process.env.GIT_TERMINAL_PROMPT ??= '0';
    process.env.GCM_INTERACTIVE ??= 'never';
    nonInteractiveApplied = true;
  }
  const settings = {
    ...(options?.timeout ? { timeout: { block: options.timeout } } : {}),
    ...(options?.config ? { config: options.config } : {}),
  };
  return options?.baseDir
    ? simpleGit(options.baseDir, settings)
    : simpleGit(settings);
}

/** 30s base, doubled in CI, plus a 50% bump on Windows. */
export function gitTimeout(): number {
  const baseTimeout = 30000;
  const isCI = process.env.CI;
  const isWindows = process.platform === 'win32';

  let timeout = baseTimeout;
  if (isCI) timeout *= 2;
  if (isWindows) timeout *= 1.5;

  return timeout;
}
