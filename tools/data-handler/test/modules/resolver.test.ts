import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createResolver } from '../../src/modules/resolver.js';
import type { SourceLayer, FetchTarget } from '../../src/modules/source.js';
import { toVersionRange } from '../../src/modules/types.js';
import type {
  ModuleDeclaration,
  DiamondVersionConflict,
} from '../../src/modules/types.js';

/**
 * Minimal `cardsConfig.json` shape the resolver reads via readConfig.
 * Only `cardKeyPrefix` and `modules` matter.
 */
interface FakeModuleConfig {
  cardKeyPrefix?: string;
  name?: string;
  modules?: Array<{
    name: string;
    location: string;
    version?: string;
    private?: boolean;
  }>;
}

/**
 * In-memory `SourceLayer` that writes a synthetic `cardsConfig.json`
 * into `destRoot/<nameHint>/.cards/local/` on `fetch`, so the
 * resolver's `readConfig` can actually read something. `fetch` is
 * instrumented so each test can assert whether a given module was
 * fetched and with what ref.
 */
class InMemorySource implements SourceLayer {
  readonly fetchLog: Array<{
    location: string;
    remoteUrl: string;
    ref?: string;
    nameHint: string;
  }> = [];
  readonly listLog: string[] = [];

  constructor(
    private readonly configs: Map<string, FakeModuleConfig>,
    private readonly availableByLocation: Map<string, string[]>,
    private readonly fetchOverrides: Map<
      string,
      () => Promise<never>
    > = new Map(),
  ) {}

  async fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string> {
    this.fetchLog.push({
      location: target.location,
      remoteUrl: target.remoteUrl,
      ref: target.ref,
      nameHint,
    });
    const override = this.fetchOverrides.get(target.location);
    if (override) {
      await override();
    }
    const dir = join(destRoot, nameHint);
    await mkdir(join(dir, '.cards', 'local'), { recursive: true });
    const config = this.configs.get(target.location) ?? {
      cardKeyPrefix: nameHint,
      name: nameHint,
      modules: [],
    };
    await writeFile(
      join(dir, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify(config),
    );
    return dir;
  }

  async listRemoteVersions(location: string): Promise<string[]> {
    this.listLog.push(location);
    return this.availableByLocation.get(location) ?? [];
  }

  async queryRemote(): Promise<never> {
    throw new Error('queryRemote not used by resolver tests');
  }
}

function decl(
  name: string,
  location: string,
  range?: string,
  projectPath = '/project',
): ModuleDeclaration {
  return {
    project: projectPath,
    name,
    source: { location, private: false },
    versionRange: range ? toVersionRange(range) : undefined,
  };
}

describe('modules/resolver', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'modules-resolver-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resolves a single root to the highest version in its range', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          { cardKeyPrefix: 'A', name: 'A', modules: [] },
        ],
      ]),
      new Map([['https://example.com/A.git', ['2.0.0', '1.5.0', '1.0.0']]]),
    );
    const resolver = createResolver(source);

    const out = await resolver.resolve(
      [decl('A', 'https://example.com/A.git', '^1.0.0')],
      { tempDir },
    );

    expect(out).toHaveLength(1);
    expect(out[0].declaration.name).toBe('A');
    expect(out[0].ref).toBe('v1.5.0');
    expect(out[0].version).toBe('1.5.0');
    expect(out[0].remoteUrl).toBe('https://example.com/A.git');
  });

  it('walks a deep tree breadth-first, parents before children', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            cardKeyPrefix: 'A',
            name: 'A',
            modules: [{ name: 'B', location: 'https://example.com/B.git' }],
          },
        ],
        [
          'https://example.com/B.git',
          { cardKeyPrefix: 'B', name: 'B', modules: [] },
        ],
      ]),
      new Map([
        ['https://example.com/A.git', ['1.0.0']],
        ['https://example.com/B.git', ['2.0.0']],
      ]),
    );
    const resolver = createResolver(source);

    const out = await resolver.resolve(
      [decl('A', 'https://example.com/A.git', '^1.0.0')],
      { tempDir },
    );

    expect(out.map((r) => r.declaration.name)).toEqual(['A', 'B']);
    expect(out[1].declaration.parent).toEqual({
      project: '/project',
      name: 'A',
    });
  });

  it('dedups with compatible ranges without firing onConflict', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            cardKeyPrefix: 'A',
            name: 'A',
            modules: [
              {
                name: 'B',
                location: 'https://example.com/B.git',
                version: '^1.0.0',
              },
            ],
          },
        ],
        [
          'https://example.com/C.git',
          {
            cardKeyPrefix: 'C',
            name: 'C',
            modules: [
              {
                name: 'B',
                location: 'https://example.com/B.git',
                version: '^1.2.0',
              },
            ],
          },
        ],
        [
          'https://example.com/B.git',
          { cardKeyPrefix: 'B', name: 'B', modules: [] },
        ],
      ]),
      new Map([
        ['https://example.com/A.git', ['1.0.0']],
        ['https://example.com/B.git', ['1.5.0']],
        ['https://example.com/C.git', ['1.0.0']],
      ]),
    );
    const resolver = createResolver(source);
    const onConflict = vi.fn();

    const out = await resolver.resolve(
      [
        decl('A', 'https://example.com/A.git', '^1.0.0'),
        decl('C', 'https://example.com/C.git', '^1.0.0'),
      ],
      { tempDir, onConflict },
    );

    expect(out.map((r) => r.declaration.name).sort()).toEqual(['A', 'B', 'C']);
    expect(onConflict).not.toHaveBeenCalled();
  });

  it('surfaces DiamondVersionConflict (and keeps first) on incompatible ranges', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            cardKeyPrefix: 'A',
            name: 'A',
            modules: [
              {
                name: 'B',
                location: 'https://example.com/B.git',
                version: '^1.0.0',
              },
            ],
          },
        ],
        [
          'https://example.com/C.git',
          {
            cardKeyPrefix: 'C',
            name: 'C',
            modules: [
              {
                name: 'B',
                location: 'https://example.com/B.git',
                version: '^2.0.0',
              },
            ],
          },
        ],
        [
          'https://example.com/B.git',
          { cardKeyPrefix: 'B', name: 'B', modules: [] },
        ],
      ]),
      new Map([
        ['https://example.com/A.git', ['1.0.0']],
        ['https://example.com/C.git', ['1.0.0']],
        ['https://example.com/B.git', ['1.5.0', '2.0.0']],
      ]),
    );
    const resolver = createResolver(source);
    const conflicts: DiamondVersionConflict[] = [];

    const out = await resolver.resolve(
      [
        decl('A', 'https://example.com/A.git', '^1.0.0'),
        decl('C', 'https://example.com/C.git', '^1.0.0'),
      ],
      {
        tempDir,
        onConflict: (event) => conflicts.push(event),
      },
    );

    const b = out.find((r) => r.declaration.name === 'B');
    expect(b?.version).toBe('1.5.0');
    expect(conflicts).toHaveLength(1);
    // Normalised by toVersionRange — compare against the normalised form.
    expect(conflicts[0].name).toBe('B');
    expect(conflicts[0].rejectingRange).toBe(toVersionRange('^2.0.0'));
    expect(conflicts[0].installedVersion).toEqual({
      kind: 'pinned',
      value: '1.5.0',
    });
  });

  it('override returns the exact version without calling listRemoteVersions', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/B.git',
          { cardKeyPrefix: 'B', name: 'B', modules: [] },
        ],
      ]),
      new Map([['https://example.com/B.git', ['2.0.0', '1.5.0']]]),
    );
    const resolver = createResolver(source);

    const out = await resolver.resolve(
      [decl('B', 'https://example.com/B.git', '^1.0.0')],
      {
        tempDir,
        overrides: new Map([['B', '0.9.0']]),
      },
    );

    expect(out[0].version).toBe('0.9.0');
    expect(out[0].ref).toBe('v0.9.0');
    expect(source.listLog).not.toContain('https://example.com/B.git');
  });

  it('file-source root: no listRemoteVersions call, ref/version undefined', async () => {
    // Stage the file source on disk so fetch can read its cardsConfig.
    const staged = join(tempDir, 'file-src');
    await mkdir(join(staged, '.cards', 'local'), { recursive: true });
    await writeFile(
      join(staged, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'F', name: 'F', modules: [] }),
    );
    const fileLocation = `file:${staged}`;

    const source = new InMemorySource(
      new Map([[fileLocation, { cardKeyPrefix: 'F', name: 'F', modules: [] }]]),
      new Map(),
    );
    const resolver = createResolver(source);

    const out = await resolver.resolve([decl('F', fileLocation, '^1.0.0')], {
      tempDir,
    });

    expect(out).toHaveLength(1);
    expect(out[0].ref).toBeUndefined();
    expect(out[0].version).toBeUndefined();
    expect(source.listLog).toEqual([]);
  });

  it('throws when no remote version satisfies the declared range', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/X.git',
          { cardKeyPrefix: 'X', name: 'X', modules: [] },
        ],
      ]),
      new Map([['https://example.com/X.git', ['1.0.0']]]),
    );
    const resolver = createResolver(source);

    await expect(
      resolver.resolve([decl('X', 'https://example.com/X.git', '^5.0.0')], {
        tempDir,
      }),
    ).rejects.toThrow(/No version satisfies range.*for module 'X'/);
  });

  it('throws when the same name is declared with two different source locations', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            cardKeyPrefix: 'A',
            name: 'A',
            modules: [
              // A declares a transitive B via location #1.
              { name: 'B', location: 'https://example.com/B1.git' },
            ],
          },
        ],
        [
          'https://example.com/C.git',
          {
            cardKeyPrefix: 'C',
            name: 'C',
            modules: [
              // C declares a transitive B via location #2 — spec invariant
              // violation.
              { name: 'B', location: 'https://example.com/B2.git' },
            ],
          },
        ],
        [
          'https://example.com/B1.git',
          { cardKeyPrefix: 'B', name: 'B', modules: [] },
        ],
      ]),
      new Map([
        ['https://example.com/A.git', ['1.0.0']],
        ['https://example.com/C.git', ['1.0.0']],
      ]),
    );
    const resolver = createResolver(source);

    await expect(
      resolver.resolve(
        [
          decl('A', 'https://example.com/A.git'),
          decl('C', 'https://example.com/C.git'),
        ],
        { tempDir },
      ),
    ).rejects.toThrow(/Conflicting source for module 'B'/);
  });

  it('populates stagedPath on every resolved module with an existing directory', async () => {
    // Spec invariant from the reuse-staged-fetches refactor: the resolver
    // stages each module's clone and records the path on its
    // ResolvedModule so the installer can reuse it instead of cloning
    // again. Every entry must carry a populated stagedPath that points
    // at a real directory on disk.
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            cardKeyPrefix: 'A',
            name: 'A',
            modules: [{ name: 'B', location: 'https://example.com/B.git' }],
          },
        ],
        [
          'https://example.com/B.git',
          {
            cardKeyPrefix: 'B',
            name: 'B',
            modules: [{ name: 'C', location: 'https://example.com/C.git' }],
          },
        ],
        [
          'https://example.com/C.git',
          { cardKeyPrefix: 'C', name: 'C', modules: [] },
        ],
      ]),
      new Map(),
    );
    const resolver = createResolver(source);

    const out = await resolver.resolve(
      [decl('A', 'https://example.com/A.git')],
      { tempDir },
    );

    expect(out.map((r) => r.declaration.name)).toEqual(['A', 'B', 'C']);
    for (const entry of out) {
      expect(entry.stagedPath).toBeTypeOf('string');
      expect(entry.stagedPath.length).toBeGreaterThan(0);
      expect(existsSync(entry.stagedPath)).toBe(true);
    }
  });

  it('reuses caller-supplied stagedPath without calling source.fetch', async () => {
    // When the import command pre-fetches the fresh-root module and
    // hands the resolver a ModuleDeclaration with `stagedPath` set, the
    // resolver must reuse the directory rather than re-fetching.
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          { cardKeyPrefix: 'A', name: 'A', modules: [] },
        ],
      ]),
      new Map(),
    );
    const resolver = createResolver(source);

    // Pre-stage the module by hand (mirroring what Import.importModule
    // does on its pre-fetch) and pass the path into the declaration.
    const preStaged = join(tempDir, 'pre-staged-A');
    await mkdir(join(preStaged, '.cards', 'local'), { recursive: true });
    await writeFile(
      join(preStaged, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'A', name: 'A', modules: [] }),
    );

    const rootDecl: ModuleDeclaration = {
      project: '/project',
      name: 'A',
      source: { location: 'https://example.com/A.git', private: false },
      stagedPath: preStaged,
    };

    const out = await resolver.resolve([rootDecl], { tempDir });

    expect(out).toHaveLength(1);
    expect(out[0].stagedPath).toBe(preStaged);
    expect(source.fetchLog).toEqual([]);
  });

  it('throws when a declaration with an empty name reaches the resolver', async () => {
    // Callers must resolve names before invoking the resolver. The
    // fresh-root path is owned by the import command now.
    const source = new InMemorySource(new Map(), new Map());
    const resolver = createResolver(source);

    await expect(
      resolver.resolve([decl('', 'https://example.com/whatever.git')], {
        tempDir,
      }),
    ).rejects.toThrow(/empty name/);
  });
});
