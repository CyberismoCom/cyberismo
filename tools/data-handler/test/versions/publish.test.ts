/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { expectRefused, projects } from '../cards/fixture.js';
import { git } from './fixture.js';
import { checkoutOf } from '../../src/infra/internal.js';

const open = projects();
const spec = { version: '1.2.3', git: true };

const remotes: string[] = [];
afterEach(async () => {
  for (const remote of remotes.splice(0)) await rm(remote, { recursive: true });
});

// A bare repository the project is wired to as `name`.
async function withRemote(path: string, name = 'origin') {
  const remote = await mkdtemp(join(tmpdir(), 'publish-remote-'));
  remotes.push(remote);
  await git(remote, 'init', '--bare', '--initial-branch=main');
  await git(path, 'remote', 'add', name, remote);
  return remote;
}

const tagsOf = async (path: string) =>
  (await git(path, 'tag')).split('\n').filter(Boolean);

describe('versions.publish', { timeout: 30_000 }, () => {
  it.each([
    ['origin', undefined],
    ['upstream', 'upstream'],
  ])('tags the version and pushes the tag to %s', async (name, remoteArg) => {
    const { ws, path } = await open(spec);
    const remote = await withRemote(path, name);

    const result = await ws.versions.publish(false, remoteArg);

    expect(result).toEqual({ version: '1.2.3', remote: name, dryRun: false });
    expect(await tagsOf(path)).toEqual(['v1.2.3']);
    expect(await git(remote, 'tag')).toBe('v1.2.3');
    expect(await git(path, 'tag', '-l', '--format=%(contents:subject)')).toBe(
      'Release v1.2.3',
    );
  });

  it('tags the commit the project is at', async () => {
    const { ws, path } = await open(spec);
    await withRemote(path);

    await ws.versions.publish(false);

    expect(await git(path, 'rev-list', '-n1', 'v1.2.3')).toBe(
      await git(path, 'rev-parse', 'HEAD'),
    );
  });

  it('reports what it would do in a dry run, tagging and pushing nothing', async () => {
    const { ws, path } = await open(spec);
    const remote = await withRemote(path);

    const result = await ws.versions.publish(true);

    expect(result).toEqual({
      version: '1.2.3',
      remote: 'origin',
      dryRun: true,
    });
    expect(await tagsOf(path)).toEqual([]);
    expect(await tagsOf(remote)).toEqual([]);
  });

  it('refuses a project without a version, tagging nothing', async () => {
    const { ws, path } = await open({ git: true });

    await expectRefused(
      path,
      () => ws.versions.publish(false),
      /No version set/,
    );
    expect(await tagsOf(path)).toEqual([]);
  });

  it('refuses a version that is published already', async () => {
    const { ws, path } = await open(spec);
    await withRemote(path);
    await ws.versions.publish(false);

    await expect(ws.versions.publish(false)).rejects.toThrow(
      'Version v1.2.3 is already published. Bump the version first.',
    );
    await expect(ws.versions.publish(true)).rejects.toThrow(
      'already published',
    );
  });

  it('publishes the next version after a bump', async () => {
    const { ws, path } = await open(spec, { autocommit: true });
    await withRemote(path);
    await ws.versions.publish(false);

    await ws.versions.bump('minor');
    await ws.versions.publish(false);

    expect(await tagsOf(path)).toEqual(['v1.2.3', 'v1.3.0']);
  });

  it('keeps the tag when the push fails, and tells how to push it', async () => {
    const { ws, path } = await open(spec);

    await expect(ws.versions.publish(false)).rejects.toThrow(
      /^Tagged v1\.2\.3, but could not push it to 'origin': [\s\S]*; push it with 'git push origin v1\.2\.3'$/,
    );
    expect(await tagsOf(path)).toEqual(['v1.2.3']);
  });

  it('pushes once the write that tagged is over', async () => {
    const { ws, path } = await open(spec);
    await withRemote(path);
    const events: string[] = [];
    checkoutOf(ws).lock.onReleased(() => events.push('released'));
    const push = checkoutOf(ws).git.push.bind(checkoutOf(ws).git);
    vi.spyOn(checkoutOf(ws).git, 'push').mockImplementation(async (options) => {
      events.push('push');
      return push(options);
    });

    await ws.versions.publish(false);

    expect(events).toEqual(['released', 'push']);
  });
});
