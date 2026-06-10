import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cloneFromGitServiceMock = vi.fn();
const isGitServiceEnabledMock = vi.fn();
const resolveGitServiceClonePathMock = vi.fn();
const scanForProjectsMock = vi.fn();
const cloneMock = vi.fn();
const envMock = vi.fn(() => ({ clone: cloneMock }));
const simpleGitMock = vi.fn(() => ({ env: envMock }));

vi.mock('../src/utils/git-service-client.js', () => ({
  clone: cloneFromGitServiceMock,
  isGitServiceEnabled: isGitServiceEnabledMock,
  resolveGitServiceClonePath: resolveGitServiceClonePathMock,
}));

vi.mock('../src/project-scanner.js', () => ({
  scanForProjects: scanForProjectsMock,
}));

vi.mock('simple-git', () => ({
  simpleGit: simpleGitMock,
}));

describe('Create.cloneProject', () => {
  let destPath: string;

  beforeEach(async () => {
    destPath = await mkdtemp(join(tmpdir(), 'create-clone-dest-'));
    cloneFromGitServiceMock.mockReset();
    isGitServiceEnabledMock.mockReset();
    resolveGitServiceClonePathMock.mockReset();
    scanForProjectsMock.mockReset();
    cloneMock.mockReset();
    envMock.mockClear();
    simpleGitMock.mockClear();
  });

  afterEach(async () => {
    await rm(destPath, { recursive: true, force: true });
  });

  it('uses git-service clone when enabled', async () => {
    const { Create } = await import('../src/commands/create.js');

    isGitServiceEnabledMock.mockReturnValue(true);
    const clonedPath = join(destPath, 'service-clone');
    resolveGitServiceClonePathMock.mockReturnValue(clonedPath);
    cloneFromGitServiceMock.mockImplementation(async () => {
      await mkdir(clonedPath, { recursive: true });
      return '.git-service-clones/test-clone';
    });
    scanForProjectsMock.mockResolvedValue(['project']);

    const result = await Create.cloneProject(
      'https://example.com/repo.git',
      destPath,
    );

    expect(cloneFromGitServiceMock).toHaveBeenCalledTimes(1);
    expect(resolveGitServiceClonePathMock).toHaveBeenCalledWith(
      '.git-service-clones/test-clone',
    );
    expect(simpleGitMock).not.toHaveBeenCalled();
    expect(result).toBe(join(destPath, 'repo'));
  });

  it('uses simple-git clone when git-service is disabled', async () => {
    const { Create } = await import('../src/commands/create.js');

    isGitServiceEnabledMock.mockReturnValue(false);
    cloneMock.mockImplementation(
      async (_url: string, tempClonePath: string) => {
        await mkdir(tempClonePath, { recursive: true });
      },
    );
    scanForProjectsMock.mockResolvedValue(['project']);

    const result = await Create.cloneProject(
      'https://example.com/repo.git',
      destPath,
    );

    expect(simpleGitMock).toHaveBeenCalledTimes(1);
    expect(cloneFromGitServiceMock).not.toHaveBeenCalled();
    expect(result).toBe(join(destPath, 'repo'));
  });
});
