import { afterEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

describe('git-service-client', () => {
  const originalGitServiceUrl = process.env.GIT_SERVICE_URL;
  const originalGitServiceProjectRoot = process.env.GIT_SERVICE_PROJECT_ROOT;

  function restoreGitServiceUrl() {
    if (originalGitServiceUrl === undefined) {
      delete process.env.GIT_SERVICE_URL;
      return;
    }
    process.env.GIT_SERVICE_URL = originalGitServiceUrl;
  }

  function restoreGitServiceProjectRoot() {
    if (originalGitServiceProjectRoot === undefined) {
      delete process.env.GIT_SERVICE_PROJECT_ROOT;
      return;
    }
    process.env.GIT_SERVICE_PROJECT_ROOT = originalGitServiceProjectRoot;
  }

  async function loadClient() {
    vi.resetModules();
    return import('../src/utils/git-service-client.js');
  }

  afterEach(() => {
    restoreGitServiceUrl();
    restoreGitServiceProjectRoot();
    vi.unstubAllGlobals();
  });

  it('isGitServiceEnabled reflects GIT_SERVICE_URL presence', async () => {
    process.env.GIT_SERVICE_URL = '';
    let client = await loadClient();
    expect(client.isGitServiceEnabled()).toBe(false);

    process.env.GIT_SERVICE_URL = 'http://git-service:8080';
    client = await loadClient();
    expect(client.isGitServiceEnabled()).toBe(true);
  });

  it('resolveGitServiceClonePath converts service path to absolute path', async () => {
    process.env.GIT_SERVICE_URL = 'http://git-service:8080';
    const client = await loadClient();

    expect(
      client.resolveGitServiceClonePath(
        '.git-service-clones/550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toBe(
      join(
        '/project',
        '.git-service-clones',
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    );
  });

  it('resolveGitServiceClonePath respects GIT_SERVICE_PROJECT_ROOT override', async () => {
    process.env.GIT_SERVICE_URL = 'http://git-service:8080';
    process.env.GIT_SERVICE_PROJECT_ROOT = '/mnt/shared';
    const client = await loadClient();

    expect(
      client.resolveGitServiceClonePath(
        '.git-service-clones/550e8400-e29b-41d4-a716-446655440000',
      ),
    ).toBe(
      join(
        '/mnt/shared',
        '.git-service-clones',
        '550e8400-e29b-41d4-a716-446655440000',
      ),
    );
  });

  it('resolveGitServiceClonePath rejects absolute paths', async () => {
    process.env.GIT_SERVICE_URL = 'http://git-service:8080';
    const client = await loadClient();

    expect(() =>
      client.resolveGitServiceClonePath('/tmp/myproject/.temp/modules/base'),
    ).toThrow(/invalid clone path/i);
  });

  it('fetchTags calls /tags and returns array payload', async () => {
    process.env.GIT_SERVICE_URL = 'http://git-service:8080';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(['2.0.0', '1.0.0']), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = await loadClient();
    const tags = await client.fetchTags('https://example.com/repo.git');

    expect(tags).toEqual(['2.0.0', '1.0.0']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://git-service:8080/tags?url=https%3A%2F%2Fexample.com%2Frepo.git',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('clone calls /clone and returns path', async () => {
    process.env.GIT_SERVICE_URL = 'http://git-service:8080';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          path: '550e8400-e29b-41d4-a716-446655440000',
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = await loadClient();
    const result = await client.clone({
      url: 'https://example.com/repo.git',
      ref: 'v1.2.3',
      shallow: true,
    });

    expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
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
