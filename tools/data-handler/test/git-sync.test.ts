import { describe, expect, it, vi } from 'vitest';

import { sleep } from '../src/utils/common-utils.js';
import { GitSync } from '../src/utils/git-sync.js';
import type { GitManager } from '../src/utils/git-manager.js';

type FakeManager = GitManager & {
  push: ReturnType<typeof vi.fn>;
  getRemoteUrl: ReturnType<typeof vi.fn>;
};

const REMOTE = 'git@example.com:acme/project.git';

/** A repository with a remote, whose pushes behave as `push` says. */
function manager(push: () => Promise<void>): FakeManager {
  return {
    getRemoteUrl: vi.fn(async () => REMOTE),
    push: vi.fn(push),
  } as unknown as FakeManager;
}

const settle = (ms = 30) => sleep(ms);

describe('GitSync', () => {
  it('collapses a burst of commits into at most two pushes', async () => {
    // With autocommit there is a commit per card edit. The first pushes
    // immediately and everything arriving during it becomes one follow-up, so
    // a burst costs two pushes however long it is, never one per commit.
    const git = manager(async () => {});
    const sync = new GitSync(git);

    for (let i = 0; i < 200; i += 1) void sync.push();
    await settle();

    expect(git.push).toHaveBeenCalled();
    expect(git.push.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('does not run two pushes against the repository at once', async () => {
    // Overlapping pushes would contend on the same index and refs.
    let inFlight = 0;
    let peak = 0;
    const git = manager(async () => {
      peak = Math.max(peak, ++inFlight);
      await settle(20);
      inFlight--;
    });

    const sync = new GitSync(git);
    void sync.push();
    await settle(5);
    await Promise.all([sync.push(), sync.push(), sync.push()]);

    expect(peak).toBe(1);
  });

  it('does not push a project that has no remote', async () => {
    // Supported state, not a misconfiguration: the URL can be set later, while
    // a silo enables autopush unconditionally. Attempting the push would cost
    // three failures and an error log on every card edit.
    const git = manager(async () => {});
    git.getRemoteUrl.mockResolvedValue(null);

    await new GitSync(git, { retryDelayMs: 1 }).push();

    expect(git.push).not.toHaveBeenCalled();
  });

  it('never throws into the caller when a push fails', async () => {
    // A failed push must not surface to the user as a failed card save.
    const git = manager(async () => {
      throw new Error('boom');
    });

    await expect(
      new GitSync(git, { retryDelayMs: 1 }).push(),
    ).resolves.toBeUndefined();
  });

  it('retries a failed push, bounded', async () => {
    // Retrying is the whole error strategy now that a rejected push is not
    // told apart from any other failure, so the bound is what matters: one
    // attempt plus MAX_RETRIES, then give up and wait for the next commit.
    const git = manager(async () => {
      throw new Error('remote unreachable');
    });

    await new GitSync(git, { retryDelayMs: 1 }).push();

    expect(git.push).toHaveBeenCalledTimes(3);
  });
});
