// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { simpleGit, type SimpleGit } from 'simple-git';

// Suppress the credential prompt and Git Credential Manager popups.
let nonInteractiveApplied = false;

// Git for Windows refuses to check out a path of 260 characters or more
// unless core.longpaths is on, and the clone then fails with "Filename too
// long". Module and project clones go under the .temp folder of the project,
// and a module with nested template cards can reach that length there.
// Git ignores the setting on other platforms.
const DEFAULT_CONFIG = ['core.longpaths=true'];

/**
 * Build a git client that cannot prompt.
 *
 * The flags go on `process.env`, not simple-git's `.env()`: that *replaces* the
 * child environment rather than extending it, stripping GIT_SSH_COMMAND,
 * SSH_AUTH_SOCK and GIT_CONFIG_* — and simple-git refuses to forward those
 * anyway. Inherited environment is the only route that carries them.
 *
 * simple-git strips inherited GIT_* variables it is not told to allow, so the
 * whole inherited environment is allowed through.
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
    allowEnvironment: Object.keys(process.env),
    ...(options?.timeout ? { timeout: { block: options.timeout } } : {}),
    config: [...DEFAULT_CONFIG, ...(options?.config ?? [])],
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
