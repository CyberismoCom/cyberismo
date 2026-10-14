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

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { localFolder } from '../../src/api/directory/local-folder.js';
import { Fetch } from '../../src/infra/hub-store.js';
import { FileSourceLayer } from '../../src/infra/module-source/source-file.js';
import { SYSTEM_ACTOR } from '../../src/shared/utils/tx-record.js';
import { projects } from '../cards/fixture.js';
import { buildProject } from '../helpers/project-builder.js';
import { readJson } from '../resources/fixture.js';

import type {
  Workspace,
  WorkspaceOptions,
} from '../../src/api/workspace/workspace.js';
import { checkoutOf } from '../../src/infra/internal.js';

// A module operation fetches outside the workspace lock; these run something
// else in that window, at the hub refresh that opens it.
const open = projects();
const valid = join(import.meta.dirname, '..', 'test-data', 'valid');
const mini = `file:${join(valid, 'minimal')}`;
const enumf = `file:${join(valid, 'card-with-enum-field')}`;

const declared = (path: string) =>
  readJson(join(path, '.cards', 'local', 'cardsConfig.json')).modules.map(
    (m: { name: string }) => m.name,
  );

const operationDirs = (path: string) => {
  const dir = join(path, '.temp', 'modules');
  return existsSync(dir)
    ? readdirSync(dir).filter((name) => name.startsWith('op-'))
    : [];
};

function whileFetching(meanwhile: () => Promise<unknown>) {
  let done = false;
  vi.spyOn(Fetch.prototype, 'ensureModuleListUpToDate').mockImplementation(
    async () => {
      if (!done) {
        done = true;
        await meanwhile();
      }
      return [];
    },
  );
}

// Gives the installed module `mini` a version of its own.
const versionMini = (path: string, version: string) => {
  const file = join(path, '.cards', 'modules', 'mini', 'cardsConfig.json');
  writeFileSync(file, JSON.stringify({ ...readJson(file), version }));
};

// A handle on the project as a directory holds it, and its replacement there.
async function held(path: string, options?: WorkspaceOptions) {
  const { directory } = await localFolder(path, options);
  const [{ prefix }] = await directory.list();
  return {
    ws: await directory.open(prefix, SYSTEM_ACTOR),
    replace: () => directory.replace(prefix),
  };
}

const built: (() => Promise<void>)[] = [];

// A project on disk that nothing has opened.
async function unopened(spec: Parameters<typeof buildProject>[0] = {}) {
  const project = await buildProject(spec);
  built.push(project.cleanup);
  return project;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of built.splice(0)) await cleanup();
});

describe('a module operation fetching outside the lock', () => {
  it('leaves no staging directory behind', async () => {
    const { ws, path } = await open();

    await ws.modules.install(mini);

    expect(declared(path)).toEqual(['mini']);
    expect(operationDirs(path)).toEqual([]);
  });

  type Meanwhile = (ws: Workspace, path: string) => Promise<unknown>;
  const changeMiniFiles: Meanwhile = async (_, path) =>
    writeFileSync(
      join(path, '.cards', 'modules', 'mini', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'mini', name: 'changed' }),
    );

  it.each<[string, Meanwhile, ((path: string) => void)?]>([
    ['a module is declared', (ws) => ws.modules.install(enumf)],
    ["an unversioned module's files change", changeMiniFiles],
    [
      "an installed module's version is raised",
      async (_, path) => versionMini(path, '1.1.0'),
      (path) => versionMini(path, '1.0.0'),
    ],
  ])(
    'is refused as a conflict when %s meanwhile',
    async (_, meanwhile, before) => {
      const { ws, path } = await open();
      await ws.modules.install(mini);
      before?.(path);
      whileFetching(() => meanwhile(ws, path));

      await expect(ws.modules.update({ module: 'mini' })).rejects.toMatchObject(
        {
          code: 'conflict',
        },
      );
      expect(operationDirs(path)).toEqual([]);
    },
  );

  it('is refused as a conflict when a dry run sees the modules change', async () => {
    const { ws, path } = await open();
    await ws.modules.install(mini);
    // A file source's read stands in for the remote listing.
    const readMetadata = FileSourceLayer.prototype.readMetadata;
    let done = false;
    vi.spyOn(FileSourceLayer.prototype, 'readMetadata').mockImplementation(
      async function (this: FileSourceLayer, source) {
        if (!done) {
          done = true;
          await changeMiniFiles(ws, path);
        }
        return readMetadata.call(this, source);
      },
    );

    await expect(ws.modules.planUpdate({})).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('leaves the directory alone when replaced while waiting to write', async () => {
    const { path } = await unopened({ git: true });
    const { ws, replace } = await held(path, { autocommit: true });
    // The checkout that replaced this one has changes of its own.
    const theirs = join(path, 'cardRoot', 'theirs.txt');
    const lock = checkoutOf(ws).lock;
    const write = lock.write.bind(lock) as (...args: unknown[]) => unknown;
    vi.spyOn(lock, 'write').mockImplementation((async (...args: unknown[]) => {
      await replace();
      writeFileSync(theirs, 'theirs');
      return write(...args);
    }) as typeof lock.write);

    await expect(ws.modules.install(mini)).rejects.toMatchObject({
      code: 'workspace-disposed',
    });
    expect(existsSync(theirs)).toBe(true);
  });

  it('applies nothing into a checkout replaced meanwhile', async () => {
    const { path } = await unopened();
    const { ws, replace } = await held(path);
    whileFetching(replace);

    await expect(ws.modules.install(mini)).rejects.toMatchObject({
      code: 'workspace-disposed',
    });
    expect(declared(path)).toEqual([]);
    expect(operationDirs(path)).toEqual([]);
  });
});
