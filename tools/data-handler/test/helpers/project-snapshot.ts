// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { promisify } from 'node:util';

// Hubs are fetched through it and it refuses: creating stays offline.
export const OFFLINE_EGRESS_PROXY = 'http://127.0.0.1:9';

/**
 * A git configuration of its own in `folder`, so commits do not depend on the
 * machine's: user.* is Ann, nothing is signed.
 * @returns the environment that points git at it.
 */
export async function isolatedGitEnv(
  folder: string,
): Promise<Record<string, string>> {
  const config = join(folder, 'gitconfig');
  await writeFile(
    config,
    '[user]\n\tname = Ann\n\temail = ann@example.com\n' +
      '[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n',
  );
  return { GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
}

/**
 * What creating a project left at `path`: each file with its content (logs
 * by name only), and each commit's author, committer, subject and files;
 * `git status --porcelain` lines (sorted) show what was left uncommitted;
 * `commits` and `uncommitted` are null when there is no repository.
 */
export async function projectSnapshot(path: string) {
  const files: Record<string, string> = {};
  const entries = await readdir(path, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = relative(path, join(entry.parentPath, entry.name))
      .split(sep)
      .join('/');
    if (name.startsWith('.git/')) continue;
    files[name] = name.startsWith('.logs/')
      ? '<log>'
      : await readFile(join(path, name), 'utf-8');
  }
  const commits = existsSync(join(path, '.git'))
    ? (
        await promisify(execFile)(
          'git',
          ['log', '--format=%an <%ae> | %cn <%ce> | %s', '--name-status'],
          { cwd: path },
        )
      ).stdout
        .trim()
        .split('\n')
        .filter((line) => line !== '')
    : null;
  const uncommitted = existsSync(join(path, '.git'))
    ? (
        await promisify(execFile)('git', ['status', '--porcelain'], {
          cwd: path,
        })
      ).stdout
        .split('\n')
        .filter((line) => line !== '')
        .sort()
    : null;
  return {
    files: Object.fromEntries(
      Object.entries(files).sort(([a], [b]) => a.localeCompare(b)),
    ),
    commits,
    uncommitted,
  };
}
