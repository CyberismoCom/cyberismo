// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import { DHValidationError } from '../../src/shared/exceptions/index.js';

import {
  expectRefused,
  projects,
  readJson,
} from '../domain/resources/fixture.js';

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
    { key: 'name', value: 'Renamed' },
    { key: 'description', value: 'About it' },
    { key: 'category', value: 'Safety' },
  ] as const)(
    'update sets the $key, read back and written to cardsConfig.json',
    async ({ key, value }) => {
      const { ws, path } = await open({ name: 'Original' });

      await ws.settings.update({ [key]: value });

      expect(ws.settings[key]).toBe(value);
      expect(config(path)[key]).toBe(value);
    },
  );

  it('update sets several settings, leaving out the rest', async () => {
    const { ws, path } = await open({ name: 'Original' });
    await ws.settings.update({ category: 'Kept' });

    await ws.settings.update({ name: 'Renamed', description: 'About it' });

    expect([
      ws.settings.name,
      ws.settings.description,
      ws.settings.category,
    ]).toEqual(['Renamed', 'About it', 'Kept']);
    expect(config(path)).toMatchObject({
      name: 'Renamed',
      description: 'About it',
      category: 'Kept',
    });
  });

  it.each(['description', 'category'] as const)(
    'update with an empty %s clears it',
    async (key) => {
      const { ws, path } = await open({});
      await ws.settings.update({ [key]: 'something' });

      await ws.settings.update({ [key]: '' });

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

    await ws.settings.update({ category: 'Safety' });

    expect(config(path)).toEqual({ ...before, category: 'Safety' });
  });

  it.each(['', 'not valid!', 'a/b', 'x'.repeat(64)])(
    'refuses the project name %j, changing nothing',
    async (name) => {
      const { ws, path } = await open({ name: 'Original' });

      await expectRefused(
        path,
        () => ws.settings.update({ description: 'Not kept', name }),
        DHValidationError,
      );
      expect(ws.settings.name).toBe('Original');
      expect(ws.settings.description).toBe('');
    },
  );
});

describe('settings: the git remote', () => {
  it('is null for a project that is not a git repository, and cannot be set', async () => {
    const { ws, path } = await open({});

    expect(await ws.settings.gitRemoteUrl()).toBeNull();
    await expectRefused(
      path,
      () =>
        ws.settings.update({
          name: 'Not kept',
          gitRemoteUrl: 'https://example.com/repo.git',
        }),
      DHValidationError,
    );
  });

  it('is empty for a repository without a remote, then the URL set', async () => {
    const { ws, path } = await open({ git: true });
    expect(await ws.settings.gitRemoteUrl()).toBe('');

    await ws.settings.update({ gitRemoteUrl: 'https://example.com/repo.git' });

    expect(await ws.settings.gitRemoteUrl()).toBe(
      'https://example.com/repo.git',
    );
    expect(await git(path, 'remote', 'get-url', 'origin')).toBe(
      'https://example.com/repo.git',
    );
  });

  it('replaces a URL that was set before', async () => {
    const { ws } = await open({ git: true });
    await ws.settings.update({ gitRemoteUrl: 'https://example.com/one.git' });

    await ws.settings.update({ gitRemoteUrl: 'https://example.com/two.git' });

    expect(await ws.settings.gitRemoteUrl()).toBe(
      'https://example.com/two.git',
    );
  });

  it('is not set when another setting is refused', async () => {
    const { ws } = await open({ git: true });

    await expect(
      ws.settings.update({
        name: 'not valid!',
        gitRemoteUrl: 'https://example.com/repo.git',
      }),
    ).rejects.toThrow(/is not valid/);

    expect(await ws.settings.gitRemoteUrl()).toBe('');
  });
});

describe('settings: commits', () => {
  it('update is one commit, whatever it sets', async () => {
    const { ws, path } = await open({ git: true }, { autocommit: true });
    const before = await git(path, 'rev-list', '--count', 'HEAD');

    await ws.settings.update({
      name: 'Renamed',
      description: 'About it',
      category: 'Safety',
      gitRemoteUrl: 'https://example.com/repo.git',
    });

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

    await expect(ws.settings.update({ name: 'not valid!' })).rejects.toThrow();

    expect(await git(path, 'rev-parse', 'HEAD')).toBe(head);
  });
});
