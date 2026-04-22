import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createInstaller } from '../../src/modules/installer.js';
import type { ResolvedModule } from '../../src/modules/resolver.js';
import type { FetchTarget, SourceLayer } from '../../src/modules/source.js';
import { ProjectPaths } from '../../src/containers/project/project-paths.js';
import { toVersion, toVersionRange } from '../../src/modules/types.js';
import { makeProjectStub } from '../helpers/module-fixtures.js';

/**
 * In-memory SourceLayer fake. Populates the staging area with whatever
 * content each test wants copied into `.cards/modules/<name>/`. The
 * shared `inMemorySource` helper writes a `.cards/local/cardsConfig.json`
 * skeleton, but these installer tests need the exact subset of files
 * the installer copies into `.cards/modules/<name>/` — so the class
 * stays local.
 */
class InMemorySource implements SourceLayer {
  readonly fetchCalls: string[] = [];

  constructor(
    private readonly plan: Map<
      string,
      {
        files: Record<string, string>;
        failWith?: Error;
        /**
         * When true, `fetch` resolves successfully but the returned
         * stagingRoot has no resources folder. This forces `applyOne`
         * to fail at `copyDir` (ENOENT on readdir) without aborting
         * the network phase.
         */
        skipResourcesFolder?: boolean;
      }
    >,
  ) {}

  async fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string> {
    this.fetchCalls.push(nameHint);
    const entry = this.plan.get(target.location);
    if (entry?.failWith) {
      throw entry.failWith;
    }
    const stagingRoot = join(destRoot, nameHint);
    if (entry?.skipResourcesFolder) {
      await mkdir(stagingRoot, { recursive: true });
      return stagingRoot;
    }
    const resourcesFolder = new ProjectPaths(stagingRoot).resourcesFolder;
    await mkdir(resourcesFolder, { recursive: true });
    const files = entry?.files ?? {};
    for (const [rel, content] of Object.entries(files)) {
      const full = join(resourcesFolder, rel);
      await mkdir(join(full, '..'), { recursive: true });
      await writeFile(full, content);
    }
    return stagingRoot;
  }

  async listRemoteVersions(): Promise<string[]> {
    return [];
  }
  async queryRemote(): Promise<never> {
    throw new Error('queryRemote not used by installer tests');
  }
}

function buildResolved(
  name: string,
  location: string,
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
  };
}

describe('modules/installer', () => {
  let projectDir: string;
  let tempDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'modules-installer-project-'));
    tempDir = await mkdtemp(join(tmpdir(), 'modules-installer-temp-'));
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
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            files: {
              'cardsConfig.json': JSON.stringify({
                cardKeyPrefix: 'A',
                name: 'A',
                version: '1.2.3',
                modules: [],
              }),
              'cardTypes/marker.json': '{"x":1}',
            },
          },
        ],
      ]),
    );
    const { project, modules } = makeProjectStub({ basePath: projectDir });
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', {
        version: '1.2.3',
        range: '^1.0.0',
      }),
    ];

    await installer.install(project, resolved, { tempDir });

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

  it('leaves .cards/modules/ untouched when the network phase fails', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            files: {
              'cardsConfig.json': JSON.stringify({
                cardKeyPrefix: 'A',
                modules: [],
              }),
            },
          },
        ],
        [
          'https://example.com/B.git',
          {
            files: {} as Record<string, string>,
            failWith: new Error('clone boom'),
          },
        ],
      ]),
    );
    const { project } = makeProjectStub({ basePath: projectDir });
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' }),
      buildResolved('B', 'https://example.com/B.git', { range: '^1.0.0' }),
    ];

    await expect(
      installer.install(project, resolved, { tempDir }),
    ).rejects.toThrow(/clone boom/);

    // Network-phase failure ⇒ nothing lands under .cards/modules.
    const modulesFolder = join(projectDir, '.cards', 'modules');
    expect(existsSync(modulesFolder)).toBe(false);
  });

  it('validate=true rejects a file: source whose folder does not exist', async () => {
    const source = new InMemorySource(new Map());
    const { project } = makeProjectStub({ basePath: projectDir });
    const installer = createInstaller(source);

    const resolved = [buildResolved('F', 'file:/nonexistent/path/to/mod')];

    await expect(
      installer.install(project, resolved, {
        tempDir,
        validate: true,
      }),
    ).rejects.toThrow(/cannot find project|folder name is invalid/);

    expect(source.fetchCalls).toEqual([]);
  });

  it('does not persist a transitive declaration (parent defined)', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            files: {
              'cardsConfig.json': JSON.stringify({
                cardKeyPrefix: 'A',
                modules: [],
              }),
            },
          },
        ],
        [
          'https://example.com/B.git',
          {
            files: {
              'cardsConfig.json': JSON.stringify({
                cardKeyPrefix: 'B',
                modules: [],
              }),
            },
          },
        ],
      ]),
    );
    const { project, modules } = makeProjectStub({ basePath: projectDir });
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' }),
      buildResolved('B', 'https://example.com/B.git', {
        range: '^1.0.0',
        parent: { project: '/project', name: 'A' },
      }),
    ];

    await installer.install(project, resolved, { tempDir });

    // Both folders installed.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);
    // Only A is persisted as a top-level declaration.
    expect(modules.map((m) => m.name)).toEqual(['A']);
  });

  // The install() loop catches `applyOne` failures and continues so later
  // modules still get a chance. The subsequent persistence loop, however,
  // iterates `targets` rather than the `applied` subset — so a module
  // whose files never made it onto disk still gets written into
  // `configuration.modules`. The assertions below describe the *correct*
  // behaviour; `it.fails` keeps the suite green while pinning the bug.
  // Flip to `it(...)` once `installer.ts` iterates `applied` (or otherwise
  // filters failed stages) in the persistence loop.
  it.fails(
    'persists only successfully applied modules when applyOne throws mid-batch',
    async () => {
      const source = new InMemorySource(
        new Map([
          [
            'https://example.com/A.git',
            {
              files: {
                'cardsConfig.json': JSON.stringify({
                  cardKeyPrefix: 'A',
                  modules: [],
                }),
              },
            },
          ],
          [
            'https://example.com/B.git',
            { files: {}, skipResourcesFolder: true },
          ],
          [
            'https://example.com/C.git',
            {
              files: {
                'cardsConfig.json': JSON.stringify({
                  cardKeyPrefix: 'C',
                  modules: [],
                }),
              },
            },
          ],
        ]),
      );
      const { project, modules } = makeProjectStub({ basePath: projectDir });
      const installer = createInstaller(source);

      const resolved = [
        buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' }),
        buildResolved('B', 'https://example.com/B.git', { range: '^1.0.0' }),
        buildResolved('C', 'https://example.com/C.git', { range: '^1.0.0' }),
      ];

      await installer.install(project, resolved, { tempDir });

      // A and C landed on disk; B did not.
      expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
      expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(
        false,
      );
      expect(existsSync(join(projectDir, '.cards', 'modules', 'C'))).toBe(true);

      // Persisted declarations should match what is actually installed.
      expect(modules.map((m) => m.name).sort()).toEqual(['A', 'C']);
    },
  );

  it('currently persists declarations for failed applyOne targets (BUG pin)', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            files: {
              'cardsConfig.json': JSON.stringify({
                cardKeyPrefix: 'A',
                modules: [],
              }),
            },
          },
        ],
        ['https://example.com/B.git', { files: {}, skipResourcesFolder: true }],
      ]),
    );
    const { project, modules } = makeProjectStub({ basePath: projectDir });
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' }),
      buildResolved('B', 'https://example.com/B.git', { range: '^1.0.0' }),
    ];

    await installer.install(project, resolved, { tempDir });

    // Pin the current (broken) behaviour: B failed to apply but the
    // persistence loop at L149–154 iterates `targets`, so B shows up in
    // `configuration.modules` anyway. Removing this assertion is part of
    // the fix.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(false);
    expect(modules.map((m) => m.name).sort()).toEqual(['A', 'B']);
  });

  it('refreshes the module cache after install', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            files: {
              'cardsConfig.json': JSON.stringify({
                cardKeyPrefix: 'A',
                modules: [],
              }),
            },
          },
        ],
      ]),
    );
    const { project, refreshAfterModuleChange } = makeProjectStub({
      basePath: projectDir,
    });
    const installer = createInstaller(source);

    await installer.install(
      project,
      [buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' })],
      { tempDir },
    );

    expect(refreshAfterModuleChange).toHaveBeenCalledTimes(1);
    // Sanity: the staged file really landed.
    const configContent = await readFile(
      join(projectDir, '.cards', 'modules', 'A', 'cardsConfig.json'),
      'utf-8',
    );
    expect(JSON.parse(configContent).cardKeyPrefix).toBe('A');
  });
});
