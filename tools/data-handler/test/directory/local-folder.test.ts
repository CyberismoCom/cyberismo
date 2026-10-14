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
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { localFolder } from '../../src/directory/local-folder.js';
import { ProjectNotFoundError } from '../../src/exceptions/index.js';
import { SYSTEM_ACTOR } from '../../src/utils/tx-record.js';
import { folders } from './folder.js';

const folder = folders();

const ann = {
  actor: { kind: 'user', id: 'ann', name: 'Ann' },
  identity: { name: 'Ann', email: 'ann@example.com' },
} as const;

const git = (cwd: string, ...args: string[]) =>
  promisify(execFile)('git', args, { cwd }).then(({ stdout }) => stdout.trim());

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

describe('directory.clone', () => {
  it('adds the projects of a cloned repository, skipping a prefix it has', async () => {
    const { root } = await folder({ prefix: 'one' });
    const source = await folder({ prefix: 'one' }, { prefix: 'two' });
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
  });
});
