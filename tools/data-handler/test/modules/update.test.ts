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

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { ModuleRequestError } from '../../src/exceptions/index.js';
import type * as SourceModule from '../../src/modules/source.js';
import type { SourceLayer } from '../../src/modules/source.js';
import { InMemorySource, type FakeModuleConfig } from './in-memory-source.js';
import {
  declared,
  expectRefused,
  isInstalled,
  projects,
  readConfig,
  snapshot,
  sources,
} from './fixture.js';
import { GitManager } from '../../src/utils/git-manager.js';
import { gitLog } from '../versions/fixture.js';

// The module sources the operations under test read; unset, the real ones.
const remote = vi.hoisted(() => ({
  layer: undefined as SourceLayer | undefined,
}));
vi.mock('../../src/modules/source.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SourceModule>();
  return {
    ...actual,
    createSourceLayer: () => remote.layer ?? actual.createSourceLayer(),
  };
});

const open = projects();
const source = sources();
const loc = (name: string) => `https://hub.test/${name}.git`;
afterEach(() => {
  remote.layer = undefined;
  vi.restoreAllMocks();
});

// Module → release (oldest first) → the modules that release depends on.
// Modules named in `down` cannot be listed.
function serve(
  modules: Record<string, Record<string, string[]>>,
  down: string[] = [],
) {
  const configs = new Map<string, FakeModuleConfig>();
  // Each release carries the seals of every step before it.
  const seals = new Map<string, [string, string][]>();
  for (const [name, releases] of Object.entries(modules)) {
    Object.keys(releases).forEach((version, index, all) => {
      if (index > 0) {
        seals.set(
          `${loc(name)}@v${version}`,
          all
            .slice(0, index + 1)
            .slice(1)
            .map((to, step) => [all[step], to]),
        );
      }
    });
    configs.set(loc(name), {
      cardKeyPrefix: name,
      schemaVersion: SCHEMA_VERSION,
      name,
      modules: [],
    });
    for (const [version, deps] of Object.entries(releases)) {
      configs.set(`${loc(name)}@v${version}`, {
        cardKeyPrefix: name,
        schemaVersion: SCHEMA_VERSION,
        version,
        name,
        modules: deps.map((dep) => ({
          name: dep,
          location: loc(dep),
          version: '^1.0.0',
        })),
      });
    }
  }
  const versions = new Map(
    Object.entries(modules).map(([name, releases]) => [
      loc(name),
      Object.keys(releases).reverse(),
    ]),
  );
  remote.layer = new InMemorySource(
    configs,
    versions,
    new Map(),
    seals,
    new Set(down.map((name) => (name.includes('/') ? name : loc(name)))),
  );
  return remote.layer as InMemorySource;
}

type Ws = Awaited<ReturnType<typeof open>>['ws'];

const versionsOf = async (ws: Ws) =>
  Object.fromEntries(
    (await ws.modules.list()).map((module) => [module.name, module.version]),
  );

const releases = (...versions: string[]) =>
  Object.fromEntries(versions.map((version) => [version, [] as string[]]));

// A project with `lib` installed at its only release, and then a source that
// has more: the starting point of most updates.
async function withLib(options: Parameters<typeof open>[1] = {}) {
  const project = await open({ git: true }, options);
  serve({ lib: releases('1.0.0') });
  await project.ws.modules.install(loc('lib'));
  serve({ lib: releases('1.0.0', '1.2.0', '1.4.0', '2.0.0') });
  return project;
}

describe('modules.update', () => {
  it('moves a module to the newest release its range allows, keeping the range', async () => {
    const { ws, path } = await withLib();

    await ws.modules.update({ module: 'lib' });

    expect(await versionsOf(ws)).toEqual({ lib: '1.4.0' });
    expect(readConfig(path).modules[0].version).toBe('^1.0.0');
  });

  it('moves it to an exact release inside the range', async () => {
    const { ws } = await withLib();

    await ws.modules.update({ module: 'lib', version: '1.2.0' });

    expect(await versionsOf(ws)).toEqual({ lib: '1.2.0' });
  });

  it('declares a new range and moves across it', async () => {
    const { ws, path } = await withLib();

    await ws.modules.update({ module: 'lib', range: '^2.0.0' });

    expect(await versionsOf(ws)).toEqual({ lib: '2.0.0' });
    expect(readConfig(path).modules[0].version).toBe('^2.0.0');
  });

  it('moves every declared module when none is named', async () => {
    const { ws } = await open();
    serve({ lib: releases('1.0.0'), tool: releases('1.0.0') });
    await ws.modules.install(loc('lib'));
    await ws.modules.install(loc('tool'));
    serve({
      lib: releases('1.0.0', '1.1.0'),
      tool: releases('1.0.0', '1.3.0'),
    });

    await ws.modules.update({});

    expect(await versionsOf(ws)).toEqual({ lib: '1.1.0', tool: '1.3.0' });
  });

  it.each([
    [{ module: 'lib' }, 'Update module lib'],
    [{}, 'Update all modules'],
  ])('is one commit under autocommit: %j', async (target, subject) => {
    const { ws, path } = await withLib({ autocommit: true });

    await ws.modules.update(target);

    expect((await gitLog(path))[0]).toBe(subject);
  });

  it('changes nothing for a module already at the newest release', async () => {
    const { ws, path } = await open({ git: true }, { autocommit: true });
    serve({ lib: releases('1.0.0') });
    await ws.modules.install(loc('lib'));
    const before = snapshot(path);
    const log = await gitLog(path);

    await ws.modules.update({ module: 'lib' });

    expect(snapshot(path)).toEqual(before);
    expect(await gitLog(path)).toEqual(log);
  });

  describe('what the new release needs', () => {
    it('installs a module the new release adds, and drops one it no longer has', async () => {
      const { ws, path } = await open();
      serve({
        app: { '1.0.0': ['old'] },
        old: releases('1.0.0'),
        base: releases('1.0.0'),
      });
      await ws.modules.install(loc('app'));
      serve({
        app: { '1.0.0': ['old'], '1.1.0': ['base'] },
        old: releases('1.0.0'),
        base: releases('1.0.0'),
      });
      expect(isInstalled(path, 'old')).toBe(true);

      await ws.modules.update({ module: 'app' });

      expect(await versionsOf(ws)).toEqual({ app: '1.1.0', base: '1.0.0' });
      expect(declared(path)).toEqual(['app']);
    });
  });

  describe('refuses', () => {
    const lib = { module: 'lib' };

    it.each([
      [
        'a module the project does not have',
        { module: 'nothing' },
        /Module 'nothing' is not part of the project/,
      ],
      [
        'a release outside the declared range',
        { ...lib, version: '2.0.0' },
        /does not satisfy constraint '\^1\.0\.0'/,
      ],
      [
        'a release the source does not list',
        { ...lib, version: '1.1.0' },
        /Version '1.1.0' is not available/,
      ],
      [
        'a release older than the installed one',
        { ...lib, version: '1.0.0' },
        /cannot downgrade from 1\.4\.0 to 1\.0\.0/i,
      ],
    ])('%s, changing nothing', async (_, target, message) => {
      const { ws, path } = await withLib();
      await ws.modules.update({ module: 'lib', version: '1.4.0' });

      await expectRefused(path, () => ws.modules.update(target), message);
    });

    it('a module only another one needs, naming that one', async () => {
      const { ws, path } = await open();
      serve({ app: { '1.0.0': ['base'] }, base: releases('1.0.0') });
      await ws.modules.install(loc('app'));

      await expectRefused(
        path,
        () => ws.modules.update({ module: 'base' }),
        /'app'/,
      );
    });

    // The real source layer asks git for the releases of a git remote.
    it('a release the git remote does not list', async () => {
      const { ws, path } = await open();
      serve({ lib: releases('1.0.0') });
      await ws.modules.install(loc('lib'));
      remote.layer = undefined;
      vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
        '3.0.0',
        '2.0.0',
      ]);

      await expectRefused(
        path,
        () => ws.modules.update({ module: 'lib', version: '1.0.0' }),
        /Version '1\.0\.0' is not available[\s\S]*3\.0\.0[\s\S]*2\.0\.0/,
      );
    });

    it('a source that cannot be reached', async () => {
      const { ws, path } = await withLib();
      serve({ lib: releases('1.0.0', '1.4.0') }, ['lib']);

      const update = ws.modules.update({ module: 'lib' });

      await expectRefused(path, () => update, /unreachable/);
      await expect(update).rejects.toBeInstanceOf(ModuleRequestError);
    });
  });
});

describe('modules.planUpdate', () => {
  it('says what an update would install, without fetching a module or writing', async () => {
    const { ws, path } = await withLib();
    const source = remote.layer as InMemorySource;
    const before = snapshot(path);

    const plan = await ws.modules.planUpdate({});

    expect(plan).toMatchObject({
      ok: true,
      changes: [{ module: 'lib', from: '1.0.0', to: '1.4.0', breaking: false }],
      removed: [],
      conflicts: [],
    });
    expect(source.fetchLog).toEqual([]);
    expect(snapshot(path)).toEqual(before);
  });

  it('names the newest release of each module, even one the range holds back', async () => {
    const { ws } = await withLib();

    const plan = await ws.modules.planUpdate({});

    expect(plan.roots).toEqual([
      expect.objectContaining({
        module: 'lib',
        installed: '1.0.0',
        latest: '2.0.0',
      }),
    ]);
  });

  it('plans what the update then does', async () => {
    const { ws } = await withLib();
    const plan = await ws.modules.planUpdate({ module: 'lib' });

    await ws.modules.update({ module: 'lib' });

    expect(await versionsOf(ws)).toEqual({ lib: plan.changes[0].to });
  });

  it('plans a new range as a write to the declaration', async () => {
    const { ws } = await withLib();

    expect(
      await ws.modules.planUpdate({ module: 'lib', range: '^2.0.0' }),
    ).toMatchObject({
      rangeWrites: [{ module: 'lib', range: '^2.0.0' }],
      changes: [{ module: 'lib', to: '2.0.0', breaking: true }],
    });
  });

  // Pins today's behaviour: an unversioned file module is planned as a change
  // from null to null.
  it('plans a plain reinstall of a module whose source lists no releases', async () => {
    const { ws } = await open();
    const lib = await source({ prefix: 'lib' });
    await ws.modules.install(lib);

    expect(await ws.modules.planUpdate({})).toMatchObject({
      ok: true,
      changes: [{ module: 'lib', from: null, to: null, breaking: false }],
      roots: [{ module: 'lib', installed: null, range: null, latest: null }],
    });
  });

  it('plans the removal of a module the new release drops', async () => {
    const { ws } = await open();
    serve({ app: { '1.0.0': ['old'] }, old: releases('1.0.0') });
    await ws.modules.install(loc('app'));
    serve({
      app: { '1.0.0': ['old'], '1.1.0': [] },
      old: releases('1.0.0'),
    });

    expect((await ws.modules.planUpdate({})).removed).toEqual(['old']);
  });

  it.each([
    [{ module: 'nothing' }],
    [{ module: 'lib', version: '2.0.0' }],
    [{ module: 'lib', version: '1.1.0' }],
  ])('refuses what update refuses: %j', async (target) => {
    const { ws } = await withLib();

    const planned = await ws.modules.planUpdate(target).catch((error) => error);
    const updated = await ws.modules.update(target).catch((error) => error);

    expect(planned).toBeInstanceOf(Error);
    expect(planned.message).toBe(updated.message);
  });
});

describe('modules.listVersions', () => {
  it('lists what the source of a declared module offers', async () => {
    const { ws } = await withLib();

    expect(await ws.modules.listVersions({ module: 'lib' })).toEqual([
      '2.0.0',
      '1.4.0',
      '1.2.0',
      '1.0.0',
    ]);
  });

  it('lists what a source offers that the project does not have yet', async () => {
    const { ws, path } = await open();
    serve({ other: releases('0.1.0', '0.2.0') });
    const before = snapshot(path);

    expect(await ws.modules.listVersions({ source: loc('other') })).toEqual([
      '0.2.0',
      '0.1.0',
    ]);
    expect(snapshot(path)).toEqual(before);
  });

  it('refuses a module the project does not have', async () => {
    const { ws } = await open();

    const listing = ws.modules.listVersions({ module: 'nothing' });

    await expect(listing).rejects.toThrow(/nothing/);
    await expect(listing).rejects.toBeInstanceOf(ModuleRequestError);
  });

  it('reports a source it cannot reach without its credentials', async () => {
    const { ws } = await open();
    const source = 'https://user:secret@hub.test/none.git';
    serve({}, [source]);

    const listing = ws.modules.listVersions({ source });

    await expect(listing).rejects.toBeInstanceOf(ModuleRequestError);
    await expect(listing).rejects.toThrow(/^(?![\s\S]*secret)/);
  });
});
