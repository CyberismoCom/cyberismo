// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFileSync } from 'node:child_process';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { cloneProject } from '../../../src/api/directory/clone-project.js';
import { GitSourceLayer } from '../../../src/infra/modules/source-git.js';

const root = mkdtempSync(join(tmpdir(), 'cyberismo-git-symlink-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' });

// A project repo whose 'link' is a symlink to a file outside the repo.
const secret = join(root, 'secret.txt');
const remote = join(root, 'remote');
mkdirSync(join(remote, '.cards', 'local'), { recursive: true });
mkdirSync(join(remote, 'cardRoot'));
writeFileSync(join(remote, 'cardRoot', '.gitkeep'), '');
writeFileSync(secret, 'top secret');
writeFileSync(
  join(remote, '.cards', 'local', 'cardsConfig.json'),
  JSON.stringify({ cardKeyPrefix: 'rem', name: 'remote' }),
);
git(remote, 'init', '-q');
git(remote, 'config', 'user.email', 'a@b.c');
git(remote, 'config', 'user.name', 'a');
const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], {
  cwd: remote,
  input: secret,
})
  .toString()
  .trim();
git(remote, 'add', '.');
git(remote, 'update-index', '--add', '--cacheinfo', `120000,${blob},link`);
git(remote, 'commit', '-qm', 'init');

describe.skipIf(process.platform === 'win32')(
  'cloning a repository that contains a symlink',
  () => {
    const expectInertFile = (path: string) => {
      expect(lstatSync(path).isSymbolicLink()).toBe(false);
      expect(readFileSync(path, 'utf8')).toBe(secret);
    };

    it('checks a module out with the symlink as a plain text file', async () => {
      const staged = await new GitSourceLayer().fetch(
        { location: remote, remoteUrl: `file://${remote}` },
        join(root, 'modules'),
        'mod',
      );

      expectInertFile(join(staged, 'link'));
    });

    it('checks a project out with the symlink as a plain text file', async () => {
      const [project] = await cloneProject(
        `file://${remote}`,
        join(root, 'projects'),
      );

      expectInertFile(join(project.path, 'link'));
    });
  },
);
