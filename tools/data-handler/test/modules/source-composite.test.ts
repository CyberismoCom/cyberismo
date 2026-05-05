import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSourceLayer } from '../../src/modules/source.js';
import { CompositeSourceLayer } from '../../src/modules/source-composite.js';
import { FileSourceLayer } from '../../src/modules/source-file.js';
import { GitSourceLayer } from '../../src/modules/source-git.js';
import { GitManager } from '../../src/utils/git-manager.js';

describe('modules/source-composite', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createSourceLayer exposes fetch / listRemoteVersions / queryRemote', () => {
    const layer = createSourceLayer();
    expect(typeof layer.fetch).toBe('function');
    expect(typeof layer.listRemoteVersions).toBe('function');
    expect(typeof layer.queryRemote).toBe('function');
  });

  it('dispatches file: URLs to the file layer (no git involvement)', async () => {
    const gitSpy = vi.spyOn(GitManager, 'listRemoteVersionTags');
    const layer = createSourceLayer();

    const versions = await layer.listRemoteVersions('file:/tmp/whatever');
    expect(versions).toEqual([]);
    expect(gitSpy).not.toHaveBeenCalled();
  });

  it('dispatches https:// URLs to the git layer', async () => {
    const gitSpy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue(['1.0.0']);
    const layer = createSourceLayer();

    const versions = await layer.listRemoteVersions(
      'https://example.com/repo.git',
    );
    expect(versions).toEqual(['1.0.0']);
    expect(gitSpy).toHaveBeenCalledWith('https://example.com/repo.git');
  });

  it('dispatches git@ URLs to the git layer', async () => {
    const gitSpy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue(['2.0.0']);
    const layer = createSourceLayer();

    const versions = await layer.listRemoteVersions(
      'git@example.com:org/repo.git',
    );
    expect(versions).toEqual(['2.0.0']);
    expect(gitSpy).toHaveBeenCalledWith('git@example.com:org/repo.git');
  });

  it('dispatches bare paths to the file layer (catch-all)', async () => {
    const gitSpy = vi.spyOn(GitManager, 'listRemoteVersionTags');
    const layer = createSourceLayer();

    const versions = await layer.listRemoteVersions('/some/bare/path');
    expect(versions).toEqual([]);
    expect(gitSpy).not.toHaveBeenCalled();
  });

  it('queryRemote on a file: source is reachable with no versions', async () => {
    const layer = createSourceLayer();

    const outcome = await layer.queryRemote({
      location: 'file:/tmp/whatever',
      private: false,
    });
    expect(outcome).toEqual({
      reachable: true,
      latest: undefined,
      latestSatisfying: undefined,
    });
  });

  it('queryRemote on a git source delegates to the git layer', async () => {
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '2.0.0',
      '1.0.0',
    ]);
    const layer = createSourceLayer();

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

  it('picks the first matching route', async () => {
    // Build an explicit composite where a fake "always matches" route
    // shadows the default file/git layers.
    const sentinel: string[] = ['sentinel-version'];
    const custom = new CompositeSourceLayer([
      {
        accepts: () => true,
        layer: {
          fetch: async () => 'custom',
          supportsVersioning: () => true,
          listRemoteVersions: async () => sentinel,
          queryRemote: async () => ({ reachable: true }),
        },
      },
      {
        accepts: () => true,
        layer: new FileSourceLayer(),
      },
    ]);

    expect(await custom.listRemoteVersions('anything')).toBe(sentinel);
  });

  it('throws when no route matches', async () => {
    const empty = new CompositeSourceLayer([
      { accepts: () => false, layer: new GitSourceLayer() },
    ]);

    await expect(empty.listRemoteVersions('anything')).rejects.toThrow(
      /No source layer accepts location/,
    );
  });
});
