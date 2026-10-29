// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ModuleSettingOptions } from '@cyberismo/model';
import { Fetch } from '../../../src/state/checkout/hub-store.js';
import { projects } from '../cards/fixture.js';
import { readJson } from '../resources/fixture.js';

const open = projects();
const minimal = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'minimal',
);

// Writes the module list a hub fetch would have cached.
function cacheHubModules(path: string, modules: object[]) {
  mkdirSync(join(path, '.temp'), { recursive: true });
  writeFileSync(
    join(path, '.temp', 'moduleList.json'),
    JSON.stringify({ modules, hubs: [] }),
  );
}

const declared = (path: string) =>
  readJson(join(path, '.cards', 'local', 'cardsConfig.json')).modules;

const lastSubject = async (path: string) =>
  (
    await promisify(execFile)('git', ['log', '-1', '--format=%s'], {
      cwd: path,
    })
  ).stdout.trim();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('installing a module by its hub name', () => {
  it.each<[string, ModuleSettingOptions | undefined, boolean]>([
    ['takes the private flag from the hub', undefined, true],
    ['lets the caller override the flag', { private: false }, false],
  ])('%s', async (_, options, expected) => {
    const { ws, path } = await open({ git: true }, { autocommit: true });
    cacheHubModules(path, [{ name: 'mini', location: minimal, private: true }]);

    await ws.modules.install('mini', options);

    expect(declared(path)).toMatchObject([
      { name: 'mini', location: `file:${minimal}`, private: expected },
    ]);
    expect(await lastSubject(path)).toBe('Import module mini');
  });

  it('prefers the hub module over a path of the same name', async () => {
    const { ws, path } = await open();
    const otherProject = join(minimal, '..', 'decision-records');
    cacheHubModules(path, [{ name: otherProject, location: minimal }]);

    await ws.modules.install(otherProject);

    expect(declared(path)).toMatchObject([
      { name: 'mini', location: `file:${minimal}` },
    ]);
  });

  it('looks the name up before refreshing the cached list', async () => {
    const { ws, path } = await open();
    cacheHubModules(path, [{ name: 'mini', location: minimal }]);
    vi.spyOn(Fetch.prototype, 'ensureModuleListUpToDate').mockImplementation(
      async () => {
        cacheHubModules(path, []);
        return [];
      },
    );

    await ws.modules.install('mini');

    expect(declared(path)).toMatchObject([
      { name: 'mini', location: `file:${minimal}` },
    ]);
  });

  it('takes a name the cached list lacks as a path', async () => {
    const { ws, path } = await open();
    cacheHubModules(path, [{ name: 'other', location: minimal }]);

    await expect(ws.modules.install('mini')).rejects.toThrow(
      /cannot find project '.*mini'/,
    );
  });
});

describe('the install result', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
  });

  it('reports no replays and no new validation errors for a valid module', async () => {
    const { ws } = await open();

    expect(await ws.modules.install(minimal)).toEqual({
      replayed: [],
      skippedReplays: [],
      newValidationErrors: false,
    });
  });

  it('reports the validation errors a module brings', async () => {
    const { ws } = await open();
    const source = mkdtempSync(join(tmpdir(), 'invalid-module-'));
    dirs.push(source);
    cpSync(minimal, source, { recursive: true });
    writeFileSync(
      join(source, '.cards', 'local', 'workflows', 'broken.json'),
      JSON.stringify({
        name: 'mini/workflows/broken',
        states: [{ name: 'Created', category: 'initial' }],
        transitions: [],
        unexpected: true,
      }),
    );

    expect((await ws.modules.install(source)).newValidationErrors).toBe(true);
  });
});
