import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createInstaller } from '../../src/modules/installer.js';
import type { ResolvedModule } from '../../src/modules/resolver.js';
import type { FetchTarget, SourceLayer } from '../../src/modules/source.js';
import { ProjectPaths } from '../../src/containers/project/project-paths.js';
import { toVersion, toVersionRange } from '../../src/modules/types.js';
import type { Project } from '../../src/containers/project.js';
import type { ModuleSetting } from '../../src/interfaces/project-interfaces.js';

/**
 * In-memory SourceLayer fake. Populates the staging area with whatever
 * content the test wants copied into `.cards/modules/<name>/`. Works with
 * the installer's `ProjectPaths(stagingRoot).resourcesFolder` contract
 * (= `<stagingRoot>/.cards/local`).
 */
class InMemorySource implements SourceLayer {
  readonly fetchCalls: string[] = [];

  constructor(
    private readonly plan: Map<
      string,
      { files: Record<string, string>; failWith?: Error }
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

/**
 * Build a Project stub that exposes the fields the installer touches:
 *   configuration.modules / upsertModule, paths.modulesFolder,
 *   projectPrefix, projectPrefixes(), resources.changedModules().
 */
function makeProjectStub(basePath: string) {
  const paths = new ProjectPaths(basePath);
  const modules: ModuleSetting[] = [];
  const changedModules = vi.fn();
  const stub = {
    basePath,
    paths,
    projectPrefix: 'root',
    projectPrefixes: () => ['root', ...modules.map((m) => m.name)],
    configuration: {
      modules,
      async upsertModule(setting: ModuleSetting) {
        const existing = modules.find((m) => m.name === setting.name);
        if (existing) {
          existing.version = setting.version;
          if (setting.location) existing.location = setting.location;
          if (setting.private !== undefined) existing.private = setting.private;
        } else {
          modules.push({ ...setting });
        }
      },
    },
    resources: { changedModules },
  };
  return { stub, modules, changedModules };
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
    const { stub, modules } = makeProjectStub(projectDir);
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', {
        version: '1.2.3',
        range: '^1.0.0',
      }),
    ];

    await installer.install(stub as unknown as Project, resolved, { tempDir });

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

  it('honours options.skip so listed modules are not installed', async () => {
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
    const { stub } = makeProjectStub(projectDir);
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' }),
      buildResolved('B', 'https://example.com/B.git', { range: '^1.0.0' }),
    ];

    await installer.install(stub as unknown as Project, resolved, {
      tempDir,
      skip: new Set(['A']),
    });

    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(false);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);
    expect(source.fetchCalls).toEqual(['B']);
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
    const { stub } = makeProjectStub(projectDir);
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' }),
      buildResolved('B', 'https://example.com/B.git', { range: '^1.0.0' }),
    ];

    await expect(
      installer.install(stub as unknown as Project, resolved, { tempDir }),
    ).rejects.toThrow(/clone boom/);

    // Network-phase failure ⇒ nothing lands under .cards/modules.
    const modulesFolder = join(projectDir, '.cards', 'modules');
    expect(existsSync(modulesFolder)).toBe(false);
  });

  it('validate=true rejects a file: source whose folder does not exist', async () => {
    const source = new InMemorySource(new Map());
    const { stub } = makeProjectStub(projectDir);
    const installer = createInstaller(source);

    const resolved = [buildResolved('F', 'file:/nonexistent/path/to/mod')];

    await expect(
      installer.install(stub as unknown as Project, resolved, {
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
    const { stub, modules } = makeProjectStub(projectDir);
    const installer = createInstaller(source);

    const resolved = [
      buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' }),
      buildResolved('B', 'https://example.com/B.git', {
        range: '^1.0.0',
        parent: { project: '/project', name: 'A' },
      }),
    ];

    await installer.install(stub as unknown as Project, resolved, { tempDir });

    // Both folders installed.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);
    // Only A is persisted as a top-level declaration.
    expect(modules.map((m) => m.name)).toEqual(['A']);
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
    const { stub, changedModules } = makeProjectStub(projectDir);
    const installer = createInstaller(source);

    await installer.install(
      stub as unknown as Project,
      [buildResolved('A', 'https://example.com/A.git', { range: '^1.0.0' })],
      { tempDir },
    );

    expect(changedModules).toHaveBeenCalledTimes(1);
    // Sanity: the staged file really landed.
    const configContent = await readFile(
      join(projectDir, '.cards', 'modules', 'A', 'cardsConfig.json'),
      'utf-8',
    );
    expect(JSON.parse(configContent).cardKeyPrefix).toBe('A');
  });
});
