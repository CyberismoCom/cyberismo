import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveModules } from '../../src/modules/resolver.js';
import type { SourceLayer, FetchTarget } from '../../src/modules/source.js';
import { toVersionRange } from '../../src/modules/types.js';
import type {
  ModuleDeclaration,
  DiamondVersionConflict,
} from '../../src/modules/types.js';

/** Minimal `cardsConfig.json` shape the resolver reads. */
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
 * In-memory `SourceLayer` that writes a synthetic `cardsConfig.json` on
 * fetch. Instrumented so tests can assert fetch calls and refs.
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

    const out = await resolveModules(
      source,
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

    const out = await resolveModules(
      source,
      [decl('A', 'https://example.com/A.git', '^1.0.0')],
      { tempDir },
    );

    expect(out.map((r) => r.declaration.name)).toEqual(['A', 'B']);
    expect(out[1].declaration.parent).toEqual({
      project: '/project',
      name: 'A',
    });
  });

  it('terminates on a cycle (A -> B -> A) by resolving each name once', async () => {
    // A declares B, B declares A back. Without cycle handling the BFS
    // would re-enqueue A and loop; the resolver keys its `resolved` map
    // by name so the second visit short-circuits.
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
            modules: [{ name: 'A', location: 'https://example.com/A.git' }],
          },
        ],
      ]),
      new Map([
        ['https://example.com/A.git', ['1.0.0']],
        ['https://example.com/B.git', ['1.0.0']],
      ]),
    );

    const out = await resolveModules(
      source,
      [decl('A', 'https://example.com/A.git', '^1.0.0')],
      { tempDir },
    );

    expect(out.map((r) => r.declaration.name).sort()).toEqual(['A', 'B']);
    // A is fetched once as the top-level target; B is fetched once as
    // A's dep. The cycle edge (B -> A) must not trigger a second fetch.
    const aFetches = source.fetchLog.filter(
      (call) => call.location === 'https://example.com/A.git',
    );
    expect(aFetches).toHaveLength(1);
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
    const onConflict = vi.fn();

    const out = await resolveModules(
      source,
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
    const conflicts: DiamondVersionConflict[] = [];

    const out = await resolveModules(
      source,
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
    expect(conflicts[0].name).toBe('B');
    expect(conflicts[0].rejectingRange).toBe(toVersionRange('^2.0.0'));
    expect(conflicts[0].installedVersion).toEqual({
      kind: 'pinned',
      value: '1.5.0',
    });
  });

  it('default onConflict formats a console.warn message with name, version, range and parent', async () => {
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await resolveModules(
      source,
      [
        decl('A', 'https://example.com/A.git', '^1.0.0'),
        decl('C', 'https://example.com/C.git', '^1.0.0'),
      ],
      { tempDir },
    );

    expect(warn).toHaveBeenCalledWith(
      `Diamond version conflict for module 'B': ` +
        `installed version 1.5.0 ` +
        `does not satisfy range '${toVersionRange('^2.0.0')}' ` +
        `(required by C)`,
    );
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

    const out = await resolveModules(
      source,
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

  it('file-source root with version range: ref/version remain undefined', async () => {
    // File-source leaves return `[]` from `listRemoteVersions`, so ref and
    // version stay undefined for a file source with a version range.
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

    const out = await resolveModules(
      source,
      [decl('F', fileLocation, '^1.0.0')],
      {
        tempDir,
      },
    );

    expect(out).toHaveLength(1);
    expect(out[0].ref).toBeUndefined();
    expect(out[0].version).toBeUndefined();
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

    await expect(
      resolveModules(
        source,
        [decl('X', 'https://example.com/X.git', '^5.0.0')],
        {
          tempDir,
        },
      ),
    ).rejects.toThrow(`No version satisfies range '^5.0.0' for module 'X'`);
  });

  it('throws when the same name is declared with two different source locations', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            cardKeyPrefix: 'A',
            name: 'A',
            modules: [{ name: 'B', location: 'https://example.com/B1.git' }],
          },
        ],
        [
          'https://example.com/C.git',
          {
            cardKeyPrefix: 'C',
            name: 'C',
            modules: [
              // C declares B via a different location — must be rejected.
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

    await expect(
      resolveModules(
        source,
        [
          decl('A', 'https://example.com/A.git'),
          decl('C', 'https://example.com/C.git'),
        ],
        { tempDir },
      ),
    ).rejects.toThrow(
      `Conflicting source for module 'B': installed from 'https://example.com/B1.git' (private=false), but also declared with 'https://example.com/B2.git' (private=false)`,
    );
  });

  it('populates stagedPath on every resolved module with an existing directory', async () => {
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

    const out = await resolveModules(
      source,
      [decl('A', 'https://example.com/A.git')],
      { tempDir },
    );

    expect(out.map((r) => r.declaration.name)).toEqual(['A', 'B', 'C']);
    for (const entry of out) {
      expect(entry.stagedPath).toBeTypeOf('string');
      expect(entry.stagedPath.length).toBeGreaterThan(0);
      expect(existsSync(entry.stagedPath)).toBe(true);
    }
    // Each unique module is fetched exactly once (no duplicate fetches).
    expect(source.fetchLog).toHaveLength(3);
    expect(source.fetchLog.map((e) => e.location).sort()).toEqual(
      [
        'https://example.com/A.git',
        'https://example.com/B.git',
        'https://example.com/C.git',
      ].sort(),
    );
  });

  it('throws when a declaration with an empty name reaches the resolver', async () => {
    const source = new InMemorySource(new Map(), new Map());

    await expect(
      resolveModules(source, [decl('', 'https://example.com/whatever.git')], {
        tempDir,
      }),
    ).rejects.toThrow(/empty name/);
  });

  it('rejects a transitive child whose name would escape a join() before fetching it', async () => {
    const source = new InMemorySource(
      new Map([
        [
          'https://example.com/A.git',
          {
            cardKeyPrefix: 'A',
            name: 'A',
            modules: [
              { name: '../evil', location: 'https://example.com/evil.git' },
            ],
          },
        ],
      ]),
      new Map([['https://example.com/A.git', ['1.0.0']]]),
    );

    await expect(
      resolveModules(
        source,
        [decl('A', 'https://example.com/A.git', '^1.0.0')],
        {
          tempDir,
        },
      ),
    ).rejects.toThrow(/Invalid module name/);

    // The malicious child must be rejected at ingestion, before the
    // resolver fetches or lists versions for it.
    expect(source.fetchLog.map((f) => f.location)).toEqual([
      'https://example.com/A.git',
    ]);
    expect(source.listLog).toEqual(['https://example.com/A.git']);
  });
});
