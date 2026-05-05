import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FileSourceLayer } from '../../src/modules/source-file.js';
import { ProjectPaths } from '../../src/containers/project/project-paths.js';

/**
 * Create a project layout at `root` whose resources folder contains
 * the given files (paths relative to the resources folder).
 */
async function makeProjectAt(
  root: string,
  files: Record<string, string>,
): Promise<void> {
  const resources = new ProjectPaths(root).resourcesFolder;
  await mkdir(resources, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(resources, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
}

describe('modules/source-file', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'modules-source-file-test-'));
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it('listRemoteVersions returns [] for a file: source', async () => {
    const layer = new FileSourceLayer();
    const versions = await layer.listRemoteVersions('file:/tmp/whatever');
    expect(versions).toEqual([]);
  });

  it('listRemoteVersions returns [] for a bare path', async () => {
    const layer = new FileSourceLayer();
    const versions = await layer.listRemoteVersions('/tmp/whatever');
    expect(versions).toEqual([]);
  });

  it('queryRemote on a file: source is reachable with no versions', async () => {
    const layer = new FileSourceLayer();
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

  it('queryRemote ignores range for a file: source', async () => {
    const layer = new FileSourceLayer();
    const outcome = await layer.queryRemote(
      { location: 'file:/tmp/whatever', private: false },
      { range: '^1.0.0' },
    );
    expect(outcome).toEqual({
      reachable: true,
      latest: undefined,
      latestSatisfying: undefined,
    });
  });

  it('fetch on a file: source stages the resources subfolder and leaves the original untouched', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'file-dest');
    await mkdir(destRoot, { recursive: true });

    const sourcePath = join(tmpRoot, 'source-tree');
    await makeProjectAt(sourcePath, { 'marker.txt': 'hello' });

    const returnedPath = await layer.fetch(
      {
        location: `file:${sourcePath}`,
        remoteUrl: `file:${sourcePath}`,
      },
      destRoot,
      'my-mod',
    );

    expect(returnedPath).toBe(join(destRoot, 'my-mod'));
    const stagedResources = new ProjectPaths(returnedPath).resourcesFolder;
    expect(await readFile(join(stagedResources, 'marker.txt'), 'utf8')).toBe(
      'hello',
    );

    // Original source must remain intact — file: sources point at the
    // user's checkout and we must not move/delete it.
    const sourceResources = new ProjectPaths(sourcePath).resourcesFolder;
    expect(existsSync(join(sourceResources, 'marker.txt'))).toBe(true);
  });

  it('fetch does not copy ambient parts of the source project (e.g., .temp, .cards/modules)', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'scoped-dest');
    await mkdir(destRoot, { recursive: true });

    const sourcePath = join(tmpRoot, 'project-with-ambient');
    await makeProjectAt(sourcePath, { 'marker.txt': 'kept' });
    // Ambient state that should NOT propagate into the staged copy.
    await mkdir(join(sourcePath, '.temp', 'modules', 'leftover'), {
      recursive: true,
    });
    await writeFile(
      join(sourcePath, '.temp', 'modules', 'leftover', 'noisy.txt'),
      'noise',
    );
    await mkdir(join(sourcePath, '.cards', 'modules', 'sibling'), {
      recursive: true,
    });
    await writeFile(
      join(sourcePath, '.cards', 'modules', 'sibling', 'cardsConfig.json'),
      '{}',
    );

    const returnedPath = await layer.fetch(
      { location: `file:${sourcePath}`, remoteUrl: `file:${sourcePath}` },
      destRoot,
      'my-mod',
    );

    // Resources came over.
    const stagedResources = new ProjectPaths(returnedPath).resourcesFolder;
    expect(existsSync(join(stagedResources, 'marker.txt'))).toBe(true);
    // Ambient siblings did not.
    expect(existsSync(join(returnedPath, '.temp'))).toBe(false);
    expect(
      existsSync(
        join(new ProjectPaths(returnedPath).modulesFolder, 'sibling'),
      ),
    ).toBe(false);
  });

  it('fetch on a bare path stages the resources subfolder', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'bare-dest');
    await mkdir(destRoot, { recursive: true });

    const sourcePath = join(tmpRoot, 'bare-source-tree');
    await makeProjectAt(sourcePath, { 'marker.txt': 'bare' });

    const returnedPath = await layer.fetch(
      { location: sourcePath, remoteUrl: sourcePath },
      destRoot,
      'my-mod',
    );

    expect(returnedPath).toBe(join(destRoot, 'my-mod'));
    const stagedResources = new ProjectPaths(returnedPath).resourcesFolder;
    expect(await readFile(join(stagedResources, 'marker.txt'), 'utf8')).toBe(
      'bare',
    );
  });

  it('fetch overwrites a stale staging directory from a previous run', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'restage-dest');
    await mkdir(destRoot, { recursive: true });

    // Pre-existing stale staging tree under destRoot/my-mod.
    const stalePath = join(destRoot, 'my-mod');
    const staleResources = new ProjectPaths(stalePath).resourcesFolder;
    await mkdir(staleResources, { recursive: true });
    await writeFile(join(staleResources, 'stale.txt'), 'stale');

    const sourcePath = join(tmpRoot, 'fresh-source');
    await makeProjectAt(sourcePath, { 'fresh.txt': 'fresh' });

    const returnedPath = await layer.fetch(
      { location: `file:${sourcePath}`, remoteUrl: `file:${sourcePath}` },
      destRoot,
      'my-mod',
    );

    expect(returnedPath).toBe(stalePath);
    const stagedResources = new ProjectPaths(returnedPath).resourcesFolder;
    expect(existsSync(join(stagedResources, 'fresh.txt'))).toBe(true);
    expect(existsSync(join(stagedResources, 'stale.txt'))).toBe(false);
  });

  it('fetch on a missing file: source throws a descriptive error', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'missing-dest');
    await mkdir(destRoot, { recursive: true });

    const missing = join(tmpRoot, 'does-not-exist');
    await expect(
      layer.fetch(
        { location: `file:${missing}`, remoteUrl: `file:${missing}` },
        destRoot,
        'my-mod',
      ),
    ).rejects.toThrow(/cannot find project/);
  });

  it('fetch on a file: source with an invalid folder name throws', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'invalid-dest');
    await mkdir(destRoot, { recursive: true });

    await expect(
      layer.fetch(
        { location: 'file:.', remoteUrl: 'file:.' },
        destRoot,
        'my-mod',
      ),
    ).rejects.toThrow(/folder name is invalid/);
  });

  it('fetch on a missing bare path throws a descriptive error', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'missing-bare-dest');
    await mkdir(destRoot, { recursive: true });

    const missing = join(tmpRoot, 'no-such-bare');
    await expect(
      layer.fetch(
        { location: missing, remoteUrl: missing },
        destRoot,
        'my-mod',
      ),
    ).rejects.toThrow(/cannot find project/);
  });
});
