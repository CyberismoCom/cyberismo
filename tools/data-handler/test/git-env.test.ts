// simple-git's `.env(object)` REPLACES the child environment rather than
// extending it, AND it refuses to pass GIT_SSH_COMMAND, GIT_CONFIG_* and
// friends at all, treating them as unsafe. Inherited environment is not
// inspected, so not calling `.env()` is the only route that carries the
// proxy and agent settings a deployment without outbound access depends on.
// Reintroducing `.env()` would break every clone with a DNS error.

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGit } from '../src/utils/git-config.js';

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

  it('disables interactive prompts', async () => {
    // Without these a silo has no terminal to answer on, so a credential
    // prompt hangs the push until the idle timeout kills it.
    vi.stubEnv('GIT_TERMINAL_PROMPT', undefined as unknown as string);
    vi.stubEnv('GCM_INTERACTIVE', undefined as unknown as string);
    // The flags are applied once per module instance.
    vi.resetModules();
    const { createGit: fresh } = await import('../src/utils/git-config.js');

    fresh({ baseDir: dir });

    expect(process.env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(process.env.GCM_INTERACTIVE).toBe('never');
  });
});
