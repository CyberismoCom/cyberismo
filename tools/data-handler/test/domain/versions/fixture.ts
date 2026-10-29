// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

export const git = async (path: string, ...args: string[]) =>
  (await promisify(execFile)('git', args, { cwd: path })).stdout.trim();

// Commit subjects, newest first.
export const gitLog = async (path: string) =>
  (await git(path, 'log', '--format=%s')).split('\n');

// The version cardsConfig.json holds.
export const publishedVersion = (path: string): string | undefined =>
  JSON.parse(
    readFileSync(join(path, '.cards', 'local', 'cardsConfig.json'), 'utf-8'),
  ).version;

export const commitAll = async (path: string, message: string) => {
  await git(path, 'add', '-A');
  await git(
    path,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '--no-verify',
    '-m',
    message,
  );
};
