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
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import {
  expectRefused,
  projects,
  readJson,
} from '../../../domain/resources/fixture.js';

const open = projects();

const config = (path: string) =>
  readJson(join(path, '.cards', 'local', 'cardsConfig.json'));
const git = async (path: string, ...args: string[]) =>
  (await promisify(execFile)('git', args, { cwd: path })).stdout.trim();

describe('settings: reading', () => {
  it('reads name, prefix, category and description, with category unset', async () => {
    const { ws, path } = await open({ prefix: 'abc', name: 'Alpha project' });

    expect(ws.path).toBe(path);
    expect(ws.settings.name).toBe('Alpha project');
    expect(ws.settings.prefix).toBe('abc');
    expect(ws.settings.category).toBeUndefined();
    expect(ws.settings.description).toBe('');
  });

  it('gives the project information, with its modules and card count', async () => {
    const { ws, path } = await open({
      prefix: 'abc',
      name: 'Alpha',
      hubs: [{ location: 'https://hub.example.com/' }],
      modules: [{ prefix: 'mod' }],
      cards: [{ children: [{}] }, {}],
    });

    expect(await ws.settings.info()).toEqual({
      name: 'Alpha',
      path,
      prefix: 'abc',
      category: undefined,
      description: '',
      version: undefined,
      hubs: [{ location: 'https://hub.example.com/' }],
      modules: [expect.objectContaining({ name: 'mod' })],
      numberOfCards: 3,
    });
  });
});

describe('settings: writing', () => {
  it.each([
    { setter: 'setName', value: 'Renamed', getter: 'name', key: 'name' },
    {
      setter: 'setDescription',
      value: 'About it',
      getter: 'description',
      key: 'description',
    },
    {
      setter: 'setCategory',
      value: 'Safety',
      getter: 'category',
      key: 'category',
    },
  ] as const)(
    '$setter is read back and written to cardsConfig.json',
    async ({ setter, value, getter, key }) => {
      const { ws, path } = await open({ name: 'Original' });

      await ws.settings[setter](value);

      expect(ws.settings[getter]).toBe(value);
      expect(config(path)[key]).toBe(value);
    },
  );

  it.each(['setDescription', 'setCategory'] as const)(
    '%s with an empty string clears it',
    async (setter) => {
      const { ws, path } = await open({});
      await ws.settings[setter]('something');

      await ws.settings[setter]('');

      const key = setter === 'setCategory' ? 'category' : 'description';
      expect(ws.settings[key]).toBe('');
      expect(config(path)[key]).toBe('');
    },
  );

  it('leaves the rest of the configuration as it was', async () => {
    const { ws, path } = await open({
      hubs: [{ location: 'https://hub.example.com/' }],
      modules: [{ prefix: 'mod' }],
    });
    const before = config(path);

    await ws.settings.setCategory('Safety');

    expect(config(path)).toEqual({ ...before, category: 'Safety' });
  });

  it.each(['', 'not valid!', 'a/b', 'x'.repeat(64)])(
    'refuses the project name %j, changing nothing',
    async (name) => {
      const { ws, path } = await open({ name: 'Original' });

      await expectRefused(
        path,
        () => ws.settings.setName(name),
        /is not valid/,
      );
      expect(ws.settings.name).toBe('Original');
    },
  );
});

describe('settings: the git remote', () => {
  it('is null for a project that is not a git repository, and cannot be set', async () => {
    const { ws, path } = await open({});

    expect(await ws.settings.gitRemoteUrl()).toBeNull();
    await expectRefused(
      path,
      () => ws.settings.setGitRemoteUrl('https://example.com/repo.git'),
      /not a git repo/i,
    );
  });

  it('is empty for a repository without a remote, then the URL set', async () => {
    const { ws, path } = await open({ git: true });
    expect(await ws.settings.gitRemoteUrl()).toBe('');

    await ws.settings.setGitRemoteUrl('https://example.com/repo.git');

    expect(await ws.settings.gitRemoteUrl()).toBe(
      'https://example.com/repo.git',
    );
    expect(await git(path, 'remote', 'get-url', 'origin')).toBe(
      'https://example.com/repo.git',
    );
  });

  it('replaces a URL that was set before', async () => {
    const { ws } = await open({ git: true });
    await ws.settings.setGitRemoteUrl('https://example.com/one.git');

    await ws.settings.setGitRemoteUrl('https://example.com/two.git');

    expect(await ws.settings.gitRemoteUrl()).toBe(
      'https://example.com/two.git',
    );
  });
});

describe('settings: commits', () => {
  it.each([
    ['setName', 'Renamed', 'Set project name'],
    ['setDescription', 'About', 'Set project description'],
    ['setCategory', 'Safety', 'Set project category'],
  ] as const)(
    '%s is one commit of its own under autocommit',
    async (setter, value, subject) => {
      const { ws, path } = await open({ git: true }, { autocommit: true });
      const before = await git(path, 'rev-list', '--count', 'HEAD');

      await ws.settings[setter](value);

      expect(await git(path, 'log', '-1', '--format=%s')).toBe(subject);
      expect(Number(await git(path, 'rev-list', '--count', 'HEAD'))).toBe(
        Number(before) + 1,
      );
    },
  );

  it('several setters in one atomic write are one commit', async () => {
    const { ws, path } = await open({ git: true }, { autocommit: true });
    const before = await git(path, 'rev-list', '--count', 'HEAD');

    await ws.atomic(async () => {
      await ws.settings.setName('Renamed');
      await ws.settings.setDescription('About it');
      await ws.settings.setCategory('Safety');
    }, 'Update project settings');

    expect(await git(path, 'log', '-1', '--format=%s')).toBe(
      'Update project settings',
    );
    expect(Number(await git(path, 'rev-list', '--count', 'HEAD'))).toBe(
      Number(before) + 1,
    );
    expect([
      ws.settings.name,
      ws.settings.description,
      ws.settings.category,
    ]).toEqual(['Renamed', 'About it', 'Safety']);
  });

  it('a refused name leaves no commit', async () => {
    const { ws, path } = await open({ git: true }, { autocommit: true });
    const head = await git(path, 'rev-parse', 'HEAD');

    await expect(ws.settings.setName('not valid!')).rejects.toThrow();

    expect(await git(path, 'rev-parse', 'HEAD')).toBe(head);
  });
});
