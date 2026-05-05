import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { applyModules } from '../../src/modules/applier.js';
import type { ResolvedModule } from '../../src/modules/resolver.js';
import { ProjectPaths } from '../../src/containers/project/project-paths.js';
import { toVersion, toVersionRange } from '../../src/modules/types.js';
import { makeProjectStub } from '../helpers/module-fixtures.js';

/**
 * Write `files` under `tempDir/<name>/.cards/<prefix>/` and return the
 * absolute root, suitable for use as `ResolvedModule.stagedPath`.
 */
async function stage(
  tempDir: string,
  name: string,
  files: Record<string, string>,
): Promise<string> {
  const stagingRoot = join(tempDir, name);
  const resourcesFolder = new ProjectPaths(stagingRoot).resourcesFolder;
  await mkdir(resourcesFolder, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(resourcesFolder, rel);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content);
  }
  return stagingRoot;
}

function buildResolved(
  name: string,
  location: string,
  stagedPath: string,
  opts: {
    version?: string;
    range?: string;
    parent?: { project: string; name: string };
    privateSource?: boolean;
  } = {},
): ResolvedModule {
  return {
    declaration: {
      project: '/project',
      name,
      source: { location, private: opts.privateSource ?? false },
      versionRange: opts.range ? toVersionRange(opts.range) : undefined,
      parent: opts.parent,
    },
    ref: opts.version ? `v${opts.version}` : undefined,
    remoteUrl: location,
    version: opts.version ? toVersion(opts.version) : undefined,
    stagedPath,
  };
}

describe('modules/applier', () => {
  let projectDir: string;
  let tempDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'modules-applier-project-'));
    tempDir = await mkdtemp(join(tmpdir(), 'modules-applier-temp-'));
    await mkdir(join(projectDir, '.cards', 'local'), { recursive: true });
    await writeFile(
      join(projectDir, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'root', name: 'root', modules: [] }),
    );
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
    await rm(tempDir, { recursive: true, force: true });
  });

  it('copies staged files into .cards/modules/<name>/ and upserts the declaration (range, not tag)', async () => {
    const stagedPath = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({
        cardKeyPrefix: 'A',
        name: 'A',
        version: '1.2.3',
        modules: [],
      }),
      'cardTypes/marker.json': '{"x":1}',
    });
    const { project, modules } = makeProjectStub({ basePath: projectDir });

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', stagedPath, {
        version: '1.2.3',
        range: '^1.0.0',
      }),
    ];

    await applyModules(project, resolved, { tempDir });

    const moduleDir = join(projectDir, '.cards', 'modules', 'A');
    expect(existsSync(moduleDir)).toBe(true);
    expect(existsSync(join(moduleDir, 'cardsConfig.json'))).toBe(true);
    expect(existsSync(join(moduleDir, 'cardTypes', 'marker.json'))).toBe(true);

    expect(modules).toHaveLength(1);
    const [persisted] = modules;
    expect(persisted.name).toBe('A');
    // Persisted version is the declared RANGE, not the resolved tag.
    expect(persisted.version).toBe(toVersionRange('^1.0.0'));
    expect(persisted.location).toBe('https://example.com/A.git');
  });

  it('does not persist a transitive declaration (parent defined)', async () => {
    const stagedA = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({
        cardKeyPrefix: 'A',
        modules: [],
      }),
    });
    const stagedB = await stage(tempDir, 'B', {
      'cardsConfig.json': JSON.stringify({
        cardKeyPrefix: 'B',
        modules: [],
      }),
    });
    const { project, modules } = makeProjectStub({ basePath: projectDir });

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', stagedA, {
        range: '^1.0.0',
      }),
      buildResolved('B', 'https://example.com/B.git', stagedB, {
        range: '^1.0.0',
        parent: { project: '/project', name: 'A' },
      }),
    ];

    await applyModules(project, resolved, { tempDir });

    // Both folders installed.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);
    // Only A is persisted as a top-level declaration.
    expect(modules.map((m) => m.name)).toEqual(['A']);
  });

  it('persists only successfully applied modules when applyOne throws mid-batch', async () => {
    const stagedA = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({
        cardKeyPrefix: 'A',
        modules: [],
      }),
    });
    // B's staging root has no resources folder, so copyDir will fail
    // with ENOENT during apply.
    const stagedB = join(tempDir, 'B');
    await mkdir(stagedB, { recursive: true });
    const stagedC = await stage(tempDir, 'C', {
      'cardsConfig.json': JSON.stringify({
        cardKeyPrefix: 'C',
        modules: [],
      }),
    });
    const { project, modules } = makeProjectStub({ basePath: projectDir });

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', stagedA, {
        range: '^1.0.0',
      }),
      buildResolved('B', 'https://example.com/B.git', stagedB, {
        range: '^1.0.0',
      }),
      buildResolved('C', 'https://example.com/C.git', stagedC, {
        range: '^1.0.0',
      }),
    ];

    await applyModules(project, resolved, { tempDir });

    // A and C landed on disk; B did not.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(false);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'C'))).toBe(true);

    // Persisted declarations should match what is actually installed.
    expect(modules.map((m) => m.name).sort()).toEqual(['A', 'C']);
  });

  it('replaces a prior installation, removing files that the new version no longer ships', async () => {
    const { project, modules } = makeProjectStub({ basePath: projectDir });

    // First install: ships an orphan file.
    const stagedV1 = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({ cardKeyPrefix: 'A', modules: [] }),
      'cardTypes/orphan.json': '{"old":true}',
    });
    await applyModules(
      project,
      [
        buildResolved('A', 'https://example.com/A.git', stagedV1, {
          range: '^1.0.0',
        }),
      ],
      { tempDir },
    );

    expect(
      existsSync(join(projectDir, '.cards', 'modules', 'A', 'cardTypes', 'orphan.json')),
    ).toBe(true);

    // Re-install at a new version that no longer ships orphan.json.
    const stagedV2 = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({ cardKeyPrefix: 'A', modules: [] }),
      'cardTypes/replacement.json': '{"new":true}',
    });
    await applyModules(
      project,
      [
        buildResolved('A', 'https://example.com/A.git', stagedV2, {
          range: '^2.0.0',
        }),
      ],
      { tempDir },
    );

    const moduleDir = join(projectDir, '.cards', 'modules', 'A');
    expect(existsSync(join(moduleDir, 'cardTypes', 'replacement.json'))).toBe(true);
    expect(existsSync(join(moduleDir, 'cardTypes', 'orphan.json'))).toBe(false);

    // Persisted declaration was upserted, not duplicated.
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe('A');
  });

  it('does not leave .removing-* directories behind on a successful re-install', async () => {
    const { project } = makeProjectStub({ basePath: projectDir });

    const stagedV1 = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({ cardKeyPrefix: 'A', modules: [] }),
    });
    await applyModules(
      project,
      [buildResolved('A', 'https://example.com/A.git', stagedV1)],
      { tempDir },
    );

    const stagedV2 = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({ cardKeyPrefix: 'A', modules: [] }),
    });
    await applyModules(
      project,
      [buildResolved('A', 'https://example.com/A.git', stagedV2)],
      { tempDir },
    );

    const modulesDir = join(projectDir, '.cards', 'modules');
    const entries = await import('node:fs/promises').then((fs) =>
      fs.readdir(modulesDir),
    );
    const trash = entries.filter((e) => e.includes('.removing-'));
    expect(trash).toEqual([]);
  });

  it('refreshes the module cache after install', async () => {
    const stagedA = await stage(tempDir, 'A', {
      'cardsConfig.json': JSON.stringify({
        cardKeyPrefix: 'A',
        modules: [],
      }),
    });
    const { project, refreshAfterModuleChange } = makeProjectStub({
      basePath: projectDir,
    });

    await applyModules(
      project,
      [
        buildResolved('A', 'https://example.com/A.git', stagedA, {
          range: '^1.0.0',
        }),
      ],
      { tempDir },
    );

    // refreshAfterModuleChange is a no-op spy whose only purpose is to
    // verify that the applier triggers a cache invalidation after install.
    // There is no observable project-state outcome to assert instead: the
    // stub's `modules` array is already populated by `upsertModule` before
    // the refresh fires, so checking `modules` would not distinguish "refresh
    // called" from "refresh not called".
    expect(refreshAfterModuleChange).toHaveBeenCalledTimes(1);
    // Sanity: the staged file really landed.
    const configContent = await readFile(
      join(projectDir, '.cards', 'modules', 'A', 'cardsConfig.json'),
      'utf-8',
    );
    expect(JSON.parse(configContent).cardKeyPrefix).toBe('A');
  });
});
