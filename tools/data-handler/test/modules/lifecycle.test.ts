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

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SCHEMA_VERSION } from '@cyberismo/migrations';
import {
  declared,
  editConfig,
  expectRefused,
  fileLocation,
  isInstalled,
  projects,
  readConfig,
  sources,
} from './fixture.js';
import { gitLog } from '../versions/fixture.js';

const open = projects();
const source = sources();

// A module with a workflow, a card type and a template holding one card.
const library = {
  prefix: 'lib',
  workflows: [{ name: 'flow' }],
  cardTypes: [{ name: 'page' }],
  templates: [{ name: 'tpl', cards: [{ title: 'From lib' }] }],
};

describe('modules.install', () => {
  it('installs the module read-only beside the project and declares its source', async () => {
    const { ws, path } = await open();
    const lib = await source(library);

    await ws.modules.install(lib);

    expect(readConfig(path).modules).toEqual([
      { name: 'lib', location: fileLocation(lib), private: false },
    ]);
    expect(await ws.modules.list()).toEqual([
      { name: 'lib', version: undefined },
    ]);
    expect(await ws.resources.list('workflows')).toContain(
      'lib/workflows/flow',
    );
    expect(await ws.modules.show('lib')).toMatchObject({
      workflows: ['lib/workflows/flow'],
      cardTypes: ['lib/cardTypes/page'],
      templates: ['lib/templates/tpl'],
    });
  });

  it('lets the project use what the module brings', async () => {
    const { ws } = await open({ cardTypes: [{ name: 'page' }] });
    const lib = await source(library);

    await ws.modules.install(lib);

    const [created] = await ws.cards.create('lib/templates/tpl');
    expect((await ws.cards.details(created.key)).metadata?.title).toBe(
      'From lib',
    );
  });

  it('records a private source as private', async () => {
    const { ws, path } = await open();
    const lib = await source(library);

    await ws.modules.install(lib, { private: true });

    expect(readConfig(path).modules[0]).toMatchObject({
      name: 'lib',
      private: true,
    });
  });

  it('is one commit named for the source under autocommit', async () => {
    const { ws, path } = await open({ git: true }, { autocommit: true });
    const lib = await source(library);

    await ws.modules.install(lib);

    expect((await gitLog(path))[0]).toBe(`Import module ${lib}`);
  });

  it('brings the modules the module needs, declaring only the one asked for', async () => {
    const { ws, path } = await open();
    const base = await source({ prefix: 'base' });
    const lib = await source(library);
    editConfig(lib, (config) => {
      config.modules = [{ name: 'base', location: fileLocation(base) }];
    });

    await ws.modules.install(lib);

    expect(isInstalled(path, 'base')).toBe(true);
    expect(declared(path)).toEqual(['lib']);
    expect(await ws.modules.inventory()).toEqual([
      expect.objectContaining({
        name: 'base',
        isRoot: false,
        parents: ['lib'],
        versionSource: 'file',
      }),
      expect.objectContaining({ name: 'lib', isRoot: true, parents: [] }),
    ]);
  });

  it('leaves the project itself alone when the module depends on it', async () => {
    const { ws, path } = await open();
    const host = await source({ prefix: 'test' });
    const lib = await source(library);
    editConfig(lib, (config) => {
      config.modules = [{ name: 'test', location: fileLocation(host) }];
    });
    const before = readConfig(path).cardKeyPrefix;

    await ws.modules.install(lib);

    expect(isInstalled(path, 'test')).toBe(false);
    expect(isInstalled(path, 'lib')).toBe(true);
    expect(readConfig(path).cardKeyPrefix).toBe(before);
  });

  describe('installing it again', () => {
    it('takes the source as it is now, declaring the module once', async () => {
      const { ws, path } = await open();
      const lib = await source(library);
      await ws.modules.install(lib);
      editConfig(lib, (config) => {
        config.name = 'renamed lib';
      });

      await ws.modules.install(lib);

      expect(declared(path)).toEqual(['lib']);
      expect((await ws.modules.show('lib')).name).toBe('renamed lib');
    });

    it('drops what the source no longer needs', async () => {
      const { ws, path } = await open();
      const base = await source({ prefix: 'base' });
      const lib = await source(library);
      editConfig(lib, (config) => {
        config.modules = [{ name: 'base', location: fileLocation(base) }];
      });
      await ws.modules.install(lib);

      editConfig(lib, (config) => {
        config.modules = [];
      });
      await ws.modules.install(lib);

      expect(isInstalled(path, 'base')).toBe(false);
      expect(isInstalled(path, 'lib')).toBe(true);
    });
  });

  describe('refuses', () => {
    it('a module from another source than the one declared', async () => {
      const { ws, path } = await open();
      const lib = await source(library);
      const copy = await source(library);
      await ws.modules.install(lib);

      await expectRefused(
        path,
        () => ws.modules.install(copy),
        /Conflicting source for module 'lib'/,
      );
    });

    it.each([
      [
        'a path that is not there',
        (dir: string) => join(dir, 'nothing'),
        /cannot find project/,
      ],
      [
        'a folder name that is not valid',
        () => 'bad\0name',
        /folder name is invalid/,
      ],
    ])('%s', async (_, locate, message) => {
      const { ws, path } = await open();
      const lib = await source(library);

      await expectRefused(path, () => ws.modules.install(locate(lib)), message);
    });

    it('a module with the prefix of the project', async () => {
      const { ws, path } = await open();
      const same = await source({ prefix: 'test' });

      await expectRefused(path, () => ws.modules.install(same), /test/);
    });

    it('a module without a card key prefix', async () => {
      const { ws, path } = await open();
      const lib = await source(library);
      editConfig(lib, (config) => {
        config.cardKeyPrefix = '';
      });

      await expectRefused(path, () => ws.modules.install(lib), /cardKeyPrefix/);
    });

    it.each([
      ['newer than this tool', SCHEMA_VERSION + 1, /Upgrade cyberismo/],
      ['without a schema version', undefined, /no 'schemaVersion'/],
    ])('a module %s', async (_, schemaVersion, message) => {
      const { ws, path } = await open();
      const lib = await source(library);
      editConfig(lib, (config) => {
        config.schemaVersion = schemaVersion;
      });

      await expectRefused(path, () => ws.modules.install(lib), message);
    });

    it('a git source that cannot be reached, without giving away its credentials', async () => {
      const { ws, path } = await open();

      await expectRefused(
        path,
        () => ws.modules.install('https://user:secret@127.0.0.1:9/none.git'),
        /^(?![\s\S]*secret)[\s\S]*is unreachable/,
      );
    });
  });
});

describe('modules.remove', () => {
  it('takes the declaration and the files of the module away', async () => {
    const { ws, path } = await open();
    await ws.modules.install(await source(library));

    await ws.modules.remove('lib');

    expect(declared(path)).toEqual([]);
    expect(isInstalled(path, 'lib')).toBe(false);
    expect(await ws.modules.list()).toEqual([]);
    expect(await ws.resources.list('workflows')).not.toContain(
      'lib/workflows/flow',
    );
  });

  it('is one commit under autocommit', async () => {
    const { ws, path } = await open({ git: true }, { autocommit: true });
    await ws.modules.install(await source(library));

    await ws.modules.remove('lib');

    expect((await gitLog(path))[0]).toBe('Remove module lib');
  });

  it('takes the modules only it needed with it, and keeps the ones another module needs', async () => {
    const { ws, path } = await open();
    const base = await source({ prefix: 'base' });
    const shared = await source({ prefix: 'shared' });
    const lib = await source(library);
    const other = await source({ prefix: 'other' });
    editConfig(lib, (config) => {
      config.modules = [
        { name: 'base', location: fileLocation(base) },
        { name: 'shared', location: fileLocation(shared) },
      ];
    });
    editConfig(other, (config) => {
      config.modules = [{ name: 'shared', location: fileLocation(shared) }];
    });
    await ws.modules.install(lib);
    await ws.modules.install(other);

    await ws.modules.remove('lib');

    expect(isInstalled(path, 'base')).toBe(false);
    expect(isInstalled(path, 'shared')).toBe(true);
    expect(declared(path)).toEqual(['other']);
  });

  it('refuses a module another one needs, naming it', async () => {
    const { ws, path } = await open();
    const base = await source({ prefix: 'base' });
    const lib = await source(library);
    editConfig(lib, (config) => {
      config.modules = [{ name: 'base', location: fileLocation(base) }];
    });
    await ws.modules.install(lib);

    await expectRefused(
      path,
      () => ws.modules.remove('base'),
      /required by 'lib'\. Remove the parent module\(s\) first/,
    );
  });

  it('refuses a module the project does not have', async () => {
    const { ws, path } = await open();

    await expectRefused(
      path,
      () => ws.modules.remove('nothing'),
      /Module 'nothing' is not part of the project/,
    );
  });
});

describe('reading modules', () => {
  it('shows nothing of a module the project does not have', async () => {
    const { ws } = await open();

    await expect(ws.modules.show('nothing')).rejects.toThrow(
      "Module 'nothing' does not exist in the project",
    );
  });

  it('lists the installed modules by name with their versions', async () => {
    const { ws } = await open();
    await ws.modules.install(await source({ prefix: 'zed' }));
    const abc = await source({ prefix: 'abc', version: '2.1.0' });
    await ws.modules.install(abc);

    expect(await ws.modules.list()).toEqual([
      { name: 'abc', version: '2.1.0' },
      { name: 'zed', version: undefined },
    ]);
  });

  it('inventories each module with its range, parents and kind of source', async () => {
    const { ws } = await open();
    const lib = await source(library);
    await ws.modules.install(lib, { version: '^1.0.0' });
    await ws.modules.install(await source({ prefix: 'priv' }), {
      private: true,
    });

    expect(await ws.modules.inventory()).toEqual([
      {
        name: 'lib',
        installedVersion: undefined,
        declaredRange: '^1.0.0',
        isRoot: true,
        parents: [],
        versionSource: 'file',
      },
      expect.objectContaining({ name: 'priv', versionSource: 'private' }),
    ]);
  });
});
