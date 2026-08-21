import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const scanForProjectsMock = vi.fn();
const cloneMock = vi.fn();
// No `.env()`: simple-git refuses to pass GIT_SSH_COMMAND and GIT_CONFIG_*,
// so git inherits the environment instead.
const simpleGitMock = vi.fn(() => ({ clone: cloneMock }));

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
    scanForProjectsMock.mockReset();
    cloneMock.mockReset();
    simpleGitMock.mockClear();
  });

  afterEach(async () => {
    await rm(destPath, { recursive: true, force: true });
  });

  it('clones with simple-git, into a temp dir it then moves', async () => {
    const { Create } = await import('../src/commands/create.js');

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
    expect(result).toBe(join(destPath, 'repo'));
  });
});
