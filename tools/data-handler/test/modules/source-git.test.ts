import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitSourceLayer } from '../../src/modules/source-git.js';
import { GitManager } from '../../src/utils/git-manager.js';

describe('modules/source-git', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listRemoteVersions delegates to GitManager for https sources', async () => {
    const spy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue(['2.0.0', '1.0.0']);
    const layer = new GitSourceLayer();

    const versions = await layer.listRemoteVersions(
      'https://example.com/repo.git',
    );
    expect(versions).toEqual(['2.0.0', '1.0.0']);
    expect(spy).toHaveBeenCalledWith('https://example.com/repo.git');
  });

  it('listRemoteVersions prefers remoteUrl over location when provided', async () => {
    const spy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue([]);
    const layer = new GitSourceLayer();

    await layer.listRemoteVersions(
      'https://example.com/repo.git',
      'https://u:t@example.com/repo.git',
    );
    expect(spy).toHaveBeenCalledWith('https://u:t@example.com/repo.git');
  });

  it('queryRemote returns latest and latestSatisfying from the remote tag list', async () => {
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '2.0.0',
      '1.0.0',
    ]);
    const layer = new GitSourceLayer();

    const outcome = await layer.queryRemote(
      { location: 'https://example.com/repo.git', private: false },
      { range: '^1.0.0' },
    );
    expect(outcome).toEqual({
      reachable: true,
      latest: '2.0.0',
      latestSatisfying: '1.0.0',
    });
  });

  it('queryRemote returns { reachable: false } when listRemoteVersionTags rejects', async () => {
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockRejectedValue(
      new Error('network unreachable'),
    );
    const layer = new GitSourceLayer();

    const outcome = await layer.queryRemote({
      location: 'https://example.com/repo.git',
      private: false,
    });
    expect(outcome).toEqual({ reachable: false });
  });

  it('queryRemote returns latest without latestSatisfying when no range given', async () => {
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '2.0.0',
      '1.0.0',
    ]);
    const layer = new GitSourceLayer();

    const outcome = await layer.queryRemote({
      location: 'https://example.com/repo.git',
      private: false,
    });
    expect(outcome).toEqual({
      reachable: true,
      latest: '2.0.0',
      latestSatisfying: undefined,
    });
  });
});
