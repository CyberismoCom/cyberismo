// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  buildProject,
  type BuiltProject,
} from '../../data-handler/test/helpers/project-builder.js';

const run = promisify(execFile);
const bin = join(import.meta.dirname, '..', 'bin', 'run');

let project: BuiltProject;
let configDir: string;
let gitEnv: NodeJS.ProcessEnv;

// The author must not depend on the developer's git environment: drop the
// author/committer/config-injection env and system config, and pin global
// config to a file without user.*.
beforeEach(async () => {
  project = await buildProject({ git: true, cards: [{ title: 'Alpha' }] });
  configDir = await mkdtemp(join(tmpdir(), 'cyberismo-gitconfig-'));
  await writeFile(join(configDir, 'gitconfig'), '');
  gitEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^GIT_(AUTHOR|COMMITTER|CONFIG)_/.test(name),
    ),
  );
  gitEnv.GIT_CONFIG_NOSYSTEM = '1';
  gitEnv.GIT_CONFIG_GLOBAL = join(configDir, 'gitconfig');
});

afterEach(async () => {
  await project.cleanup();
  await rm(configDir, { recursive: true, force: true });
});

// Adds a label with the CLI under autocommit; returns the commit's subject,
// author and trailers.
async function addLabel(env: NodeJS.ProcessEnv) {
  await run(
    process.execPath,
    [bin, '--autocommit', 'create', 'label', project.keys[0], 'urgent'],
    { cwd: project.path, env },
  );
  const { stdout } = await run(
    'git',
    ['log', '-1', '--format=%s%n%an <%ae>%n%(trailers:only,unfold)'],
    { cwd: project.path },
  );
  return stdout.trim().split('\n');
}

it('commits a CLI write as the bot', async () => {
  expect(await addLabel(gitEnv)).toEqual([
    `Add label urgent to ${project.keys[0]}`,
    'Cyberismo Bot <bot@cyberismo.com>',
  ]);
}, 30000);

it('lets GIT_AUTHOR_* name the author of a CLI write', async () => {
  expect(
    await addLabel({
      ...gitEnv,
      GIT_AUTHOR_NAME: 'Xavier',
      GIT_AUTHOR_EMAIL: 'x@example.com',
    }),
  ).toEqual([
    `Add label urgent to ${project.keys[0]}`,
    'Xavier <x@example.com>',
  ]);
}, 30000);

it('commits a CLI write as the git-config user', async () => {
  const git = (...args: string[]) => run('git', args, { cwd: project.path });
  await git('config', 'user.name', 'Casey Local');
  await git('config', 'user.email', 'casey@example.com');

  expect(await addLabel(gitEnv)).toEqual([
    `Add label urgent to ${project.keys[0]}`,
    'Casey Local <casey@example.com>',
  ]);
}, 30000);

it('prefers author.* over user.* for a CLI write', async () => {
  const git = (...args: string[]) => run('git', args, { cwd: project.path });
  await git('config', 'user.name', 'Casey Local');
  await git('config', 'user.email', 'casey@example.com');
  await git('config', 'author.name', 'Avery Author');
  await git('config', 'author.email', 'avery@example.com');

  expect(await addLabel(gitEnv)).toEqual([
    `Add label urgent to ${project.keys[0]}`,
    'Avery Author <avery@example.com>',
  ]);
}, 30000);
