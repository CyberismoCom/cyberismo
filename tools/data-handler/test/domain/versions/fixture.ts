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
