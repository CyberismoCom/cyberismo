import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createSourceLayer } from '../../src/modules/source.js';
import { GitManager } from '../../src/utils/git-manager.js';

describe('modules/source', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'modules-source-test-'));
  });

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createSourceLayer exposes fetch / listRemoteVersions / queryRemote', () => {
    const layer = createSourceLayer();
    expect(typeof layer.fetch).toBe('function');
    expect(typeof layer.listRemoteVersions).toBe('function');
    expect(typeof layer.queryRemote).toBe('function');
  });

  it('listRemoteVersions returns [] for a file: source without touching git', async () => {
    const layer = createSourceLayer();
    const versions = await layer.listRemoteVersions('file:/tmp/whatever');
    expect(versions).toEqual([]);
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

  it('fetch on a file: source returns the resolved local path with no mutation', async () => {
    const layer = createSourceLayer();
    const destRoot = join(tmpRoot, 'file-dest');
    await mkdir(destRoot, { recursive: true });

    const sourcePath = join(tmpRoot, 'source-tree');
    await mkdir(sourcePath, { recursive: true });
    await writeFile(join(sourcePath, 'marker.txt'), 'hello');

    const returnedPath = await layer.fetch(
      {
        location: `file:${sourcePath}`,
        remoteUrl: `file:${sourcePath}`,
      },
      destRoot,
      'my-mod',
    );

    expect(returnedPath).toBe(sourcePath);
    // File sources must never create destRoot/<hint>.
    expect(existsSync(join(destRoot, 'my-mod'))).toBe(false);
  });

  it('listRemoteVersions delegates to GitManager for https sources', async () => {
    const spy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue(['2.0.0', '1.0.0']);
    const layer = createSourceLayer();

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
    const layer = createSourceLayer();

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

  it('queryRemote returns { reachable: false } when listRemoteVersionTags rejects', async () => {
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockRejectedValue(
      new Error('network unreachable'),
    );
    const layer = createSourceLayer();

    const outcome = await layer.queryRemote({
      location: 'https://example.com/repo.git',
      private: false,
    });
    expect(outcome).toEqual({ reachable: false });
  });
});
