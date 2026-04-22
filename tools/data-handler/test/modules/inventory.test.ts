import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createInventory } from '../../src/modules/inventory.js';
import { makeProjectStub } from '../helpers/module-fixtures.js';
import type { ModuleSetting } from '../../src/interfaces/project-interfaces.js';

function makeStub(basePath: string, modules: ModuleSetting[]) {
  return makeProjectStub({ basePath, modules }).project;
}

async function writeInstalledModule(
  projectPath: string,
  name: string,
  config: Record<string, unknown>,
): Promise<void> {
  const dir = join(projectPath, '.cards', 'modules', name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'cardsConfig.json'),
    JSON.stringify(config, null, 2),
  );
}

describe('modules/inventory', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'modules-inventory-test-'));
    // Mandatory project bits so ProjectPaths resolves sensibly.
    await mkdir(join(projectDir, '.cards', 'local'), { recursive: true });
    await writeFile(
      join(projectDir, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'root', name: 'root', modules: [] }),
    );
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  it('declared maps each project config entry to a ModuleDeclaration with parent=undefined', () => {
    const project = makeStub(projectDir, [
      {
        name: 'foo',
        location: 'https://example.com/foo.git',
        version: '^1.0.0',
      },
      {
        name: 'bar',
        location: 'file:/tmp/bar',
        private: true,
      },
    ]);
    const inventory = createInventory();

    const decls = inventory.declared(project);

    expect(decls).toHaveLength(2);
    const byName = new Map(decls.map((d) => [d.name, d]));
    expect(byName.get('foo')).toMatchObject({
      project: projectDir,
      name: 'foo',
      source: { location: 'https://example.com/foo.git', private: false },
      versionRange: '>=1.0.0 <2.0.0-0',
      parent: undefined,
    });
    expect(byName.get('bar')).toMatchObject({
      project: projectDir,
      name: 'bar',
      source: { location: 'file:/tmp/bar', private: true },
      versionRange: undefined,
      parent: undefined,
    });
  });

  it('declared returns versionRange undefined for an invalid semver range', () => {
    const project = makeStub(projectDir, [
      {
        name: 'baz',
        location: 'https://example.com/baz.git',
        version: 'not-semver',
      },
    ]);
    const inventory = createInventory();

    const [decl] = inventory.declared(project);
    expect(decl.versionRange).toBeUndefined();
    // Invalid range is warn-only; name/source still populate.
    expect(decl.name).toBe('baz');
  });

  it('installed returns [] when .cards/modules/ does not exist', async () => {
    const project = makeStub(projectDir, []);
    const inventory = createInventory();

    const installations = await inventory.installed(project);
    expect(installations).toEqual([]);
  });

  it('installed brands a valid version and attaches the declared source', async () => {
    const project = makeStub(projectDir, [
      {
        name: 'foo',
        location: 'https://example.com/foo.git',
        version: '^1.0.0',
      },
    ]);
    await writeInstalledModule(projectDir, 'foo', {
      cardKeyPrefix: 'foo',
      name: 'foo',
      version: '1.2.3',
      modules: [],
    });

    const inventory = createInventory();
    const installations = await inventory.installed(project);

    expect(installations).toHaveLength(1);
    const [foo] = installations;
    expect(foo.name).toBe('foo');
    expect(foo.version).toBe('1.2.3');
    expect(foo.source).toEqual({
      location: 'https://example.com/foo.git',
      private: false,
    });
    expect(foo.path).toBe(join(projectDir, '.cards', 'modules', 'foo'));
  });

  it('installed leaves version undefined when installation config has an invalid semver', async () => {
    const project = makeStub(projectDir, [
      {
        name: 'foo',
        location: 'https://example.com/foo.git',
      },
    ]);
    await writeInstalledModule(projectDir, 'foo', {
      cardKeyPrefix: 'foo',
      version: 'not-semver',
    });

    const inventory = createInventory();
    const [foo] = await inventory.installed(project);
    expect(foo.name).toBe('foo');
    expect(foo.version).toBeUndefined();
  });

  it('installed skips a module folder with no readable cardsConfig.json', async () => {
    const project = makeStub(projectDir, []);
    // Folder exists but has no cardsConfig.json.
    await mkdir(join(projectDir, '.cards', 'modules', 'ghost'), {
      recursive: true,
    });

    const inventory = createInventory();
    const installations = await inventory.installed(project);
    expect(installations).toEqual([]);
  });

  it('installed flags an untracked installation with an empty source.location', async () => {
    // No declaration for "trans" — it was pulled in by another installation.
    const project = makeStub(projectDir, []);
    await writeInstalledModule(projectDir, 'trans', {
      cardKeyPrefix: 'trans',
      name: 'trans',
      version: '1.0.0',
    });

    const inventory = createInventory();
    const installations = await inventory.installed(project);
    expect(installations).toHaveLength(1);
    expect(installations[0].source.location).toBe('');
    expect(installations[0].version).toBe('1.0.0');
  });
});
