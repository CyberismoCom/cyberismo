import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { GitSourceLayer } from '../../src/modules/source-git.js';
import { GitManager } from '../../src/utils/git-manager.js';

vi.mock('simple-git', () => {
  const cloneMock = vi.fn();
  const envMock = vi.fn(() => ({ clone: cloneMock }));
  const simpleGit = vi.fn(() => ({ env: envMock }));
  return { simpleGit, __cloneMock: cloneMock };
});

describe('modules/source-git', () => {
  const originalGitServiceUrl = process.env.GIT_SERVICE_URL;

  function restoreGitServiceUrl() {
    if (originalGitServiceUrl === undefined) {
      delete process.env.GIT_SERVICE_URL;
      return;
    }
    process.env.GIT_SERVICE_URL = originalGitServiceUrl;
  }

  afterEach(() => {
    restoreGitServiceUrl();
    vi.unstubAllGlobals();
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

  it('listRemoteVersions uses GitManager normalization path when git-service is enabled', async () => {
    process.env.GIT_SERVICE_URL = 'http://git-service:8080';
    const managerSpy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue(['2.0.0', '1.0.0']);
    const layer = new GitSourceLayer();
    const versions = await layer.listRemoteVersions(
      'https://example.com/repo.git',
      'https://u:t@example.com/repo.git',
    );

    expect(versions).toEqual(['2.0.0', '1.0.0']);
    expect(managerSpy).toHaveBeenCalledWith('https://u:t@example.com/repo.git');
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

  describe('fetch', () => {
    let tmpRoot: string;

    beforeAll(async () => {
      tmpRoot = await mkdtemp(join(tmpdir(), 'source-git-fetch-test-'));
    });

    afterAll(async () => {
      await rm(tmpRoot, { recursive: true, force: true });
    });

    it('wraps clone errors with "Failed to clone module" message', async () => {
      const { __cloneMock } = (await import('simple-git')) as unknown as {
        __cloneMock: ReturnType<typeof vi.fn>;
      };
      __cloneMock.mockRejectedValueOnce(new Error('authentication required'));

      const layer = new GitSourceLayer();
      await expect(
        layer.fetch(
          {
            location: 'https://example.com/repo.git',
            remoteUrl: 'https://example.com/repo.git',
          },
          tmpRoot,
          'my-module',
        ),
      ).rejects.toThrow(
        "Failed to clone module 'my-module': authentication required",
      );
    });

    it('rethrows non-Error clone failures as-is', async () => {
      const { __cloneMock } = (await import('simple-git')) as unknown as {
        __cloneMock: ReturnType<typeof vi.fn>;
      };
      const sentinel = 'raw string rejection';
      __cloneMock.mockRejectedValueOnce(sentinel);

      const layer = new GitSourceLayer();
      await expect(
        layer.fetch(
          {
            location: 'https://example.com/repo.git',
            remoteUrl: 'https://example.com/repo.git',
          },
          tmpRoot,
          'my-module',
        ),
      ).rejects.toBe(sentinel);
    });

    it('returns the destination path on a successful clone', async () => {
      const { __cloneMock } = (await import('simple-git')) as unknown as {
        __cloneMock: ReturnType<typeof vi.fn>;
      };
      __cloneMock.mockResolvedValueOnce(undefined);

      const layer = new GitSourceLayer();
      const result = await layer.fetch(
        {
          location: 'https://example.com/repo.git',
          remoteUrl: 'https://example.com/repo.git',
        },
        tmpRoot,
        'my-module',
      );

      expect(result).toBe(join(tmpRoot, 'my-module'));
    });

    it('uses git-service clone endpoint when enabled', async () => {
      process.env.GIT_SERVICE_URL = 'http://git-service:8080';
      const cloneUuid = '550e8400-e29b-41d4-a716-446655440000';
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            path: cloneUuid,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);

      vi.resetModules();
      const { GitSourceLayer: FreshLayer } =
        await import('../../src/modules/source-git.js');
      const layer = new FreshLayer();
      const result = await layer.fetch(
        {
          location: 'https://example.com/repo.git',
          remoteUrl: 'https://example.com/repo.git',
          ref: 'v1.2.3',
        },
        join(tmpRoot, 'myproject', '.temp', 'modules'),
        'my-module',
      );

      expect(result).toBe(`/project/.git-service-clones/${cloneUuid}`);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://git-service:8080/clone',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            url: 'https://example.com/repo.git',
            ref: 'v1.2.3',
            shallow: true,
          }),
        }),
      );
    });
  });
});
