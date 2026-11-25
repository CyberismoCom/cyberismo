// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

// simple-git's `.env(object)` REPLACES the child environment rather than
// extending it, AND it refuses to pass GIT_SSH_COMMAND, GIT_CONFIG_* and
// friends at all, treating them as unsafe. Inherited environment is not
// inspected, so not calling `.env()` is the only route that carries the
// proxy and agent settings a deployment without outbound access depends on.
// Reintroducing `.env()` would break every clone with a DNS error.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGit } from '../../../src/infra/git/git-config.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'git-env-'));
  execFileSync('git', ['init', '-q', dir]);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

describe('createGit', () => {
  it('carries the ambient environment through to git', async () => {
    // GIT_CONFIG_* is how a silo passes the egress proxy to git.
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'user.name');
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'ambient-marker');

    const value = await createGit({ baseDir: dir }).raw([
      'config',
      '--get',
      'user.name',
    ]);

    expect(value.trim()).toBe('ambient-marker');
  });

  it('turns on long paths, and keeps the config of the caller', async () => {
    const git = createGit({ baseDir: dir, config: ['user.name=caller'] });

    const longPaths = await git.raw(['config', '--get', 'core.longpaths']);
    const name = await git.raw(['config', '--get', 'user.name']);

    expect(longPaths.trim()).toBe('true');
    expect(name.trim()).toBe('caller');
  });

  it('clones a repository with a path of more than 260 characters', async () => {
    // Git for Windows refuses such a path unless core.longpaths is on. The
    // source tree is built with plumbing and with long paths on, so the
    // setup works everywhere and only the clone depends on createGit.
    const longPath =
      [...Array(12)].map((_, i) => `folder-${i}-xxxxxxxxxxxxx`).join('/') +
      '/index.json';
    expect(longPath.length).toBeGreaterThan(260);
    const run = (args: string[]) =>
      execFileSync('git', ['-c', 'core.longpaths=true', '-C', dir, ...args], {
        encoding: 'utf8',
      }).trim();
    const blob = execFileSync(
      'git',
      ['-c', 'core.longpaths=true', '-C', dir, 'hash-object', '-w', '--stdin'],
      {
        input: '{}\n',
        encoding: 'utf8',
      },
    ).trim();
    run(['update-index', '--add', '--cacheinfo', `100644,${blob},${longPath}`]);
    run([
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '-q',
      '-m',
      'Long path',
    ]);
    const destination = join(dir, '..', `${basename(dir)}-clone`);

    try {
      await createGit().clone(dir, destination);

      expect(existsSync(join(destination, ...longPath.split('/')))).toBe(true);
    } finally {
      await rm(destination, { recursive: true, force: true });
    }
  });

  it('disables interactive prompts', async () => {
    // Without these a silo has no terminal to answer on, so a credential
    // prompt hangs the push until the idle timeout kills it.
    vi.stubEnv('GIT_TERMINAL_PROMPT', undefined as unknown as string);
    vi.stubEnv('GCM_INTERACTIVE', undefined as unknown as string);
    // The flags are applied once per module instance.
    vi.resetModules();
    const { createGit: fresh } =
      await import('../../../src/infra/git/git-config.js');

    fresh({ baseDir: dir });

    expect(process.env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(process.env.GCM_INTERACTIVE).toBe('never');
  });
});
