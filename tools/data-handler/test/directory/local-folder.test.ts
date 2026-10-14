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

import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_HUB } from '@cyberismo/assets';

import { Rename } from '../../src/commands/rename.js';
import { localFolder } from '../../src/directory/local-folder.js';
import {
  ProjectExistsError,
  ProjectNotFoundError,
} from '../../src/exceptions/index.js';
import { resetEgressDispatcherForTest } from '../../src/utils/egress.js';
import { GitManager } from '../../src/utils/git-manager.js';
import { SYSTEM_ACTOR } from '../../src/utils/tx-record.js';
import {
  isolatedGitEnv,
  OFFLINE_EGRESS_PROXY,
} from '../helpers/project-snapshot.js';
import { folders } from './folder.js';

const folder = folders();

const ann = {
  actor: { kind: 'user', id: 'ann', name: 'Ann' },
  identity: { name: 'Ann', email: 'ann@example.com' },
} as const;

const git = (cwd: string, ...args: string[]) =>
  promisify(execFile)('git', args, { cwd }).then(({ stdout }) => stdout.trim());

// Holds the next call of `method` until `release`; `reached` resolves when it
// starts.
function hold<T extends object>(target: T, method: keyof T & string) {
  let reached!: () => void;
  let release!: () => void;
  const atCall = new Promise<void>((resolve) => (reached = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = target[method] as any;
  const spy = vi
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .spyOn(target, method as any)
    .mockImplementationOnce(async function (this: unknown, ...args: unknown[]) {
      reached();
      await released;
      return original.apply(this, args);
    });
  return { reached: atCall, release, restore: () => spy.mockRestore() };
}

// A repository at its root holding a project per spec.
async function repoOf(...specs: Parameters<typeof folder>) {
  const source = await folder(...specs);
  await git(source.root, 'init', '--initial-branch=main');
  await git(source.root, 'add', '.');
  await git(
    source.root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-m',
    'Projects',
  );
  return source;
}

describe('localFolder', () => {
  it('opens every project in the folder and lists it', async () => {
    const { root } = await folder(
      { prefix: 'one', name: 'One' },
      { prefix: 'two', name: 'Two' },
    );
    const { directory, failed } = await localFolder(root);
    await (
      await directory.open('two', SYSTEM_ACTOR)
    ).settings.setCategory('Ops');

    expect(failed).toEqual([]);
    const listed = await directory.list();
    expect(listed.sort((a, b) => a.prefix.localeCompare(b.prefix))).toEqual([
      { prefix: 'one', name: 'One' },
      { prefix: 'two', name: 'Two', category: 'Ops' },
    ]);
  });

  it('opens a folder that is itself a project', async () => {
    const { root } = await folder({ prefix: 'solo' });
    const { directory } = await localFolder(join(root, 'solo'));

    expect((await directory.list()).map((p) => p.prefix)).toEqual(['solo']);
  });

  it('reports a project that fails to load and still opens the others', async () => {
    const { root } = await folder({ prefix: 'broken' }, { prefix: 'good' });
    const brokenPath = join(root, 'broken');
    // Found by the scan, refused by the schema gate.
    await writeFile(
      join(brokenPath, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'broken', name: 'Broken' }),
    );

    const { directory, failed } = await localFolder(root);

    expect((await directory.list()).map((p) => p.prefix)).toEqual(['good']);
    expect(failed).toEqual([
      {
        prefix: 'broken',
        errors: [
          expect.stringContaining(`Failed to load project (${brokenPath}):`),
        ],
      },
    ]);
    await expect(directory.open('broken', SYSTEM_ACTOR)).rejects.toThrow(
      ProjectNotFoundError,
    );
  });

  it('refuses a folder it cannot scan', async () => {
    await expect(localFolder('/nonexistent/cyberismo-folder')).rejects.toThrow(
      'does not exist or is not a directory',
    );
  });
});

describe('directory.open', () => {
  it("gives the actor's handle: its writes commit as the actor", async () => {
    const { root, keys } = await folder({
      prefix: 'one',
      git: true,
      cards: [{ title: 'Alpha' }],
    });
    const { directory } = await localFolder(root, { autocommit: true });

    const ws = await directory.open('one', ann.actor, ann.identity);
    await ws.cards.addLabel(keys.one[0], 'first');

    expect([ws.actor, ws.identity]).toEqual([ann.actor, ann.identity]);
    expect(
      await git(join(root, 'one'), 'log', '-1', '--format=%an <%ae>'),
    ).toBe('Ann <ann@example.com>');
  });

  it('gives handles over one checkout per project', async () => {
    const { root } = await folder({ prefix: 'one' }, { prefix: 'two' });
    const { directory } = await localFolder(root);

    const [a, b, other] = await Promise.all([
      directory.open('one', SYSTEM_ACTOR),
      directory.open('one', ann.actor),
      directory.open('two', SYSTEM_ACTOR),
    ]);
    expect(a.checkout).toBe(b.checkout);
    expect(other.checkout).not.toBe(a.checkout);
  });

  it('refuses a prefix the directory does not have', async () => {
    const { root } = await folder({ prefix: 'one' });
    const { directory } = await localFolder(root);

    await expect(directory.open('nope', SYSTEM_ACTOR)).rejects.toThrow(
      new ProjectNotFoundError('nope'),
    );
  });
});

describe('directory.replace', () => {
  it('reopens the project from its files and disposes the old checkout', async () => {
    const { root } = await folder({ prefix: 'one', name: 'Before' });
    const { directory } = await localFolder(root);
    const before = await directory.open('one', SYSTEM_ACTOR);
    const config = join(root, 'one', '.cards', 'local', 'cardsConfig.json');
    await writeFile(
      config,
      (await readFile(config, 'utf-8')).replace('"Before"', '"After"'),
    );

    await directory.replace('one');

    const after = await directory.open('one', SYSTEM_ACTOR);
    expect(before.checkout.disposed).toBe(true);
    expect(after.checkout).not.toBe(before.checkout);
    expect(after.settings.name).toBe('After');
  });

  it('refuses a prefix the directory does not have', async () => {
    const { root } = await folder({ prefix: 'one' });
    const { directory } = await localFolder(root);

    await expect(directory.replace('nope')).rejects.toThrow(
      ProjectNotFoundError,
    );
  });
});

describe('directory.rename', () => {
  const prefixOf = (root: string, project: string) =>
    JSON.parse(
      readFileSync(
        join(root, project, '.cards', 'local', 'cardsConfig.json'),
        'utf-8',
      ),
    ).cardKeyPrefix;

  it('keeps the project under its new prefix', async () => {
    const { root } = await folder({ prefix: 'one' }, { prefix: 'two' });
    const { directory } = await localFolder(root);
    const before = await directory.open('one', SYSTEM_ACTOR);

    await directory.rename('one', 'uno', ann.actor);

    expect((await directory.open('uno', SYSTEM_ACTOR)).checkout).toBe(
      before.checkout,
    );
    await expect(directory.open('one', SYSTEM_ACTOR)).rejects.toThrow(
      ProjectNotFoundError,
    );
    expect((await directory.list()).map((p) => p.prefix).sort()).toEqual([
      'two',
      'uno',
    ]);
    expect(prefixOf(root, 'one')).toBe('uno');
  });

  it('refuses a prefix another project has, renaming nothing', async () => {
    const { root } = await folder({ prefix: 'one' }, { prefix: 'two' });
    const { directory } = await localFolder(root);

    await expect(directory.rename('one', 'two', ann.actor)).rejects.toThrow(
      new ProjectExistsError('two'),
    );
    expect(prefixOf(root, 'one')).toBe('one');
    expect((await directory.list()).map((p) => p.prefix).sort()).toEqual([
      'one',
      'two',
    ]);
  });

  it("refuses the project's own prefix as the rename does, not as taken", async () => {
    const { root } = await folder({ prefix: 'one' });
    const { directory } = await localFolder(root);

    await expect(directory.rename('one', 'one', ann.actor)).rejects.toThrow(
      "Project prefix is already 'one'",
    );
  });

  it('refuses a prefix an earlier rename is taking', async () => {
    const { root } = await folder({ prefix: 'one' }, { prefix: 'two' });
    const { directory } = await localFolder(root);
    let reached!: () => void;
    let release!: () => void;
    const atRename = new Promise<void>((resolve) => (reached = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    const original = Rename.prototype.rename;
    const spy = vi
      .spyOn(Rename.prototype, 'rename')
      .mockImplementationOnce(async function (this: Rename, to, force) {
        reached();
        await released;
        return original.call(this, to, force);
      });
    try {
      const first = directory.rename('one', 'uno', ann.actor);
      await atRename;
      const second = directory.rename('two', 'uno', ann.actor);
      release();

      await first;
      await expect(second).rejects.toThrow(new ProjectExistsError('uno'));
      expect(prefixOf(root, 'two')).toBe('two');
    } finally {
      spy.mockRestore();
    }
  });

  it('refuses a prefix a rename inside a write still open has taken', async () => {
    const { root } = await folder({ prefix: 'one' }, { prefix: 'two' });
    const { directory } = await localFolder(root);
    const ws = await directory.open('one', ann.actor);

    await ws.atomic(async () => {
      await directory.rename('one', 'uno', ann.actor);
      await expect(directory.rename('two', 'uno', ann.actor)).rejects.toThrow(
        new ProjectExistsError('uno'),
      );
    }, 'Update project settings');

    expect(prefixOf(root, 'two')).toBe('two');
    expect((await directory.list()).map((p) => p.prefix).sort()).toEqual([
      'two',
      'uno',
    ]);
  });

  it('follows a rename of a reopened project', async () => {
    const { root } = await folder({ prefix: 'one' });
    const { directory } = await localFolder(root);
    await directory.replace('one');
    const reopened = await directory.open('one', SYSTEM_ACTOR);

    await directory.rename('one', 'uno', ann.actor);

    expect((await directory.open('uno', SYSTEM_ACTOR)).checkout).toBe(
      reopened.checkout,
    );
    expect((await directory.list()).map((p) => p.prefix)).toEqual(['uno']);
  });

  it('refuses a published project unless forced', async () => {
    const { root } = await folder({ prefix: 'one', version: '1.0.0' });
    const { directory } = await localFolder(root);

    await expect(directory.rename('one', 'uno', ann.actor)).rejects.toThrow(
      'is this module',
    );
    await directory.rename('one', 'uno', ann.actor, undefined, {
      force: true,
    });

    expect((await directory.list()).map((p) => p.prefix)).toEqual(['uno']);
  });

  it('keeps the old prefix when the write the rename is part of fails', async () => {
    const { root } = await folder({ prefix: 'one', git: true });
    const { directory } = await localFolder(root, { autocommit: true });
    const ws = await directory.open('one', ann.actor, ann.identity);

    await expect(
      ws.atomic(async () => {
        await directory.rename('one', 'uno', ann.actor, ann.identity);
        throw new Error('a later step fails');
      }, 'Update project settings'),
    ).rejects.toThrow('a later step fails');

    expect(prefixOf(root, 'one')).toBe('one');
    expect((await directory.list()).map((p) => p.prefix)).toEqual(['one']);
  });
});

describe('directory.create', () => {
  beforeEach(async () => {
    vi.stubEnv('CYBERISMO_EGRESS_PROXY', OFFLINE_EGRESS_PROXY);
    await resetEgressDispatcherForTest();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await resetEgressDispatcherForTest();
  });

  it('creates the project under its prefix, with the default hub, and lists it', async () => {
    const { root } = await folder();
    const { directory } = await localFolder(root);

    const created = await directory.create(
      { name: 'New', prefix: 'newp', category: 'Test', description: 'A test' },
      ann.actor,
    );

    const ws = await directory.open('newp', SYSTEM_ACTOR);
    expect(ws.path).toBe(join(root, 'newp'));
    expect(ws.checkout.configuration.hubs.map((hub) => hub.location)).toEqual([
      DEFAULT_HUB,
    ]);
    expect(await directory.list()).toEqual([
      { prefix: 'newp', name: 'New', category: 'Test', description: 'A test' },
    ]);
    expect(created).toEqual({
      path: join(root, 'newp'),
      prefix: 'newp',
      failures: [],
      warnings: [`Could not fetch hub data - ${DEFAULT_HUB}: fetch failed`],
    });
  });

  it.each([
    ['without autocommit', false],
    ['with autocommit', true],
  ])('makes the initial commit as the actor %s', async (_, autocommit) => {
    const { root } = await folder();
    for (const [name, value] of Object.entries(await isolatedGitEnv(root))) {
      vi.stubEnv(name, value);
    }
    const { directory } = await localFolder(root, { autocommit });

    await directory.create({ name: 'New', prefix: 'newp' }, ann.actor, {
      name: 'Bea',
      email: 'bea@example.com',
    });

    expect(
      await git(
        join(root, 'newp'),
        'log',
        '--reverse',
        '--format=%an <%ae> %s',
      ),
    ).toMatch(/^Bea <bea@example.com> Initial commit/);
  });

  it('refuses a prefix an earlier rename is taking, writing nothing', async () => {
    const { root } = await folder({ prefix: 'one' });
    const { directory } = await localFolder(root);
    const rename = hold(Rename.prototype, 'rename');
    try {
      const first = directory.rename('one', 'uno', ann.actor);
      await rename.reached;
      const second = directory.create(
        { name: 'New', prefix: 'uno' },
        ann.actor,
      );
      rename.release();

      await first;
      await expect(second).rejects.toThrow(new ProjectExistsError('uno'));
      expect(await readdir(root)).toEqual(['one']);
    } finally {
      rename.restore();
    }
  });

  it("refuses the prefix a renamed project's folder still has", async () => {
    const { root } = await folder({ prefix: 'one' });
    const { directory } = await localFolder(root);
    await directory.rename('one', 'uno', ann.actor);

    await expect(
      directory.create({ name: 'New', prefix: 'one' }, ann.actor),
    ).rejects.toThrow(new ProjectExistsError('one'));
  });

  it('makes a clone started meanwhile skip its prefix', async () => {
    const { root } = await folder();
    const source = await repoOf({ prefix: 'newp' });
    const { directory } = await localFolder(root);
    const init = hold(GitManager.prototype, 'initialize');
    try {
      const first = directory.create(
        { name: 'New', prefix: 'newp' },
        ann.actor,
      );
      await init.reached;
      const second = directory.clone(source.root);
      init.release();

      await first;
      expect(await second).toEqual({
        projects: [],
        skippedDuplicates: ['newp'],
      });
      expect((await directory.open('newp', SYSTEM_ACTOR)).path).toBe(
        join(root, 'newp'),
      );
    } finally {
      init.restore();
    }
  });
});

describe('directory.clone', () => {
  it('adds the projects of a cloned repository, skipping a prefix it has', async () => {
    const { root } = await folder({ prefix: 'one' });
    const source = await repoOf({ prefix: 'one' }, { prefix: 'two' });
    const { directory } = await localFolder(root);

    const result = await directory.clone(source.root);

    expect(result).toEqual({
      projects: [{ prefix: 'two', name: expect.any(String) }],
      skippedDuplicates: ['one'],
    });
    expect((await directory.list()).map((p) => p.prefix).sort()).toEqual([
      'one',
      'two',
    ]);
    // Cloned under the repository's name; the temporary clone is gone.
    expect((await readdir(root)).sort()).toEqual(
      ['one', basename(source.root)].sort(),
    );
  });

  it('skips a prefix a rename inside a write still open has taken', async () => {
    const { root } = await folder({ prefix: 'one' });
    const source = await repoOf({ prefix: 'uno' });
    const { directory } = await localFolder(root);
    const ws = await directory.open('one', ann.actor);

    await ws.atomic(async () => {
      await directory.rename('one', 'uno', ann.actor);
      expect(await directory.clone(source.root)).toEqual({
        projects: [],
        skippedDuplicates: ['uno'],
      });
    }, 'Update project settings');

    expect((await directory.list()).map((p) => p.prefix)).toEqual(['uno']);
    expect((await directory.open('uno', SYSTEM_ACTOR)).path).toBe(
      join(root, 'one'),
    );
  });
});
