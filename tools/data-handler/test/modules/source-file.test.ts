import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FileSourceLayer } from '../../src/modules/source-file.js';

describe('modules/source-file', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'modules-source-file-test-'));
  });

  afterAll(async () => {
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

  it('fetch on a file: source returns the resolved local path with no mutation', async () => {
    const layer = new FileSourceLayer();
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

  it('fetch on a bare path returns the resolved path without creating destRoot/<hint>', async () => {
    const layer = new FileSourceLayer();
    const destRoot = join(tmpRoot, 'bare-dest');
    await mkdir(destRoot, { recursive: true });

    const sourcePath = join(tmpRoot, 'bare-source-tree');
    await mkdir(sourcePath, { recursive: true });

    const returnedPath = await layer.fetch(
      { location: sourcePath, remoteUrl: sourcePath },
      destRoot,
      'my-mod',
    );

    expect(returnedPath).toBe(sourcePath);
    expect(existsSync(join(destRoot, 'my-mod'))).toBe(false);
  });
});
