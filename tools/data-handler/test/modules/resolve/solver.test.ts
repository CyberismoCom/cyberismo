import { expect, it, describe, beforeAll, afterAll, beforeEach } from 'vitest';

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { InMemorySource, type FakeModuleConfig } from '../in-memory-source.js';
import {
  resolve,
  resolveForApply,
} from '../../../src/modules/resolve/solver.js';
import type { Version } from '../../../src/modules/types.js';
import type { ModuleSetting } from '../../../src/interfaces/project-interfaces.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-resolve-solver-tests');
const minimalPath = join(testDir, 'valid/minimal');

function buildProjectWithModules(modules: ModuleSetting[]) {
  const project = getTestProject(minimalPath);
  project.configuration.modules.splice(
    0,
    project.configuration.modules.length,
    ...modules,
  );
  return project;
}

async function installModule(
  project: ReturnType<typeof getTestProject>,
  m: {
    name: string;
    version: string;
    modules?: Array<{ name: string; location: string; version?: string }>;
    seals?: Array<[string, string]>;
  },
) {
  const dir = join(project.paths.modulesFolder, m.name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'cardsConfig.json'),
    JSON.stringify({
      name: m.name,
      cardKeyPrefix: m.name,
      version: m.version,
      modules: m.modules ?? [],
    }),
  );
  if (m.seals?.length) {
    await mkdir(join(dir, 'migrations'), { recursive: true });
    for (const [f, t] of m.seals) {
      await writeFile(
        join(dir, 'migrations', `migrationLog_${f}_${t}.jsonl`),
        '',
      );
    }
  }
}

describe('resolve solver', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '../../test-data'), testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    rmSync(minimalPath, { recursive: true, force: true });
    await copyDir(join(baseDir, '../../test-data/valid/minimal'), minimalPath);
  });

  it('verify: no changes when the installed set is coherent', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.6.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '>=1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const source = new InMemorySource(new Map(), new Map());
    const result = await resolve(
      project,
      { kind: 'verify' },
      { sourceLayer: source, tempDir: testDir },
    );

    expect(result).toEqual({ ok: true, changes: [] });
  });

  it('update A to 1.8 forces B→1.4 and backtracks C 1.2→1.3', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
      {
        name: 'C',
        location: 'https://x/C.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.6.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '>=1.3.0' }],
    });
    await installModule(project, {
      name: 'C',
      version: '1.2.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '~1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.8.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.8.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/C.git@v1.3.0',
        {
          cardKeyPrefix: 'C',
          name: 'C',
          version: '1.3.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/B.git@v1.4.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.4.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.8.0', '1.6.0']],
      ['https://x/C.git', ['1.3.0', '1.2.0']],
      ['https://x/B.git', ['1.4.0', '1.3.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
      ['https://x/C.git@v1.3.0', [['1.2.0', '1.3.0']]],
      ['https://x/B.git@v1.4.0', [['1.3.0', '1.4.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      { kind: 'update', module: 'A', to: '1.8.0' as Version },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      Object.fromEntries(result.changes.map((c) => [c.module, c.to])),
    ).toEqual({ A: '1.8.0', B: '1.4.0', C: '1.3.0' });
  });

  it('unsatisfiable update reports a conflict naming the culprits', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
      {
        name: 'C',
        location: 'https://x/C.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.6.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '>=1.3.0' }],
    });
    await installModule(project, {
      name: 'C',
      version: '1.2.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '~1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.8.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.8.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=2.0.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/B.git@v2.0.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '2.0.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.8.0', '1.6.0']],
      ['https://x/C.git', ['1.2.0']],
      ['https://x/B.git', ['2.0.0', '1.3.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
      ['https://x/B.git@v2.0.0', [['1.3.0', '2.0.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      { kind: 'update', module: 'A', to: '1.8.0' as Version },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const bConflict = result.conflicts.find((c) => c.module === 'B');
    expect(bConflict).toBeDefined();
    const froms = new Set(bConflict!.demands.map((d) => d.from));
    expect(froms.has('A')).toBe(true);
    expect(froms.has('C')).toBe(true);
  });

  it('replayability prune blocks a non-linear upgrade', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.6.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '>=1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.8.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.8.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.5.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/B.git@v1.5.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.5.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.8.0', '1.6.0']],
      ['https://x/B.git', ['1.5.0', '1.3.0']],
    ]);
    // Gap: nothing covers 1.3→1.4, so computeChain(target, 1.3, 1.5) throws.
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
      ['https://x/B.git@v1.5.0', [['1.4.0', '1.5.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      { kind: 'update', module: 'A', to: '1.8.0' as Version },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(false);
  });

  it('add: fresh import seeds a new root and installs its transitive closure', async () => {
    const project = buildProjectWithModules([]);

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.0.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.0.0',
          modules: [
            { name: 'D', location: 'https://x/D.git', version: '>=1.0.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/D.git@v1.0.0',
        {
          cardKeyPrefix: 'D',
          name: 'D',
          version: '1.0.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.0.0']],
      ['https://x/D.git', ['1.0.0']],
    ]);
    const source = new InMemorySource(configs, available, new Map(), new Map());

    const result = await resolve(
      project,
      {
        kind: 'add',
        name: 'A',
        source: { location: 'https://x/A.git', private: false },
        range: undefined,
      },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byModule = new Map(result.changes.map((c) => [c.module, c]));
    expect(byModule.get('A')).toMatchObject({
      to: '1.0.0',
      from: null,
      replay: [],
    });
    expect(byModule.get('D')).toMatchObject({
      to: '1.0.0',
      from: null,
      replay: [],
    });
  });

  it('updateAll floats a transitive dep to newest even when its root stays put', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.0.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '^1.0.0' }],
    });
    await installModule(project, { name: 'B', version: '1.0.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/B.git@v1.2.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.2.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.0.0']],
      ['https://x/B.git', ['1.2.0', '1.0.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/B.git@v1.2.0', [['1.0.0', '1.2.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      { kind: 'updateAll' },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const b = result.changes.find((c) => c.module === 'B');
    expect(b).toMatchObject({ from: '1.0.0', to: '1.2.0' });
  });

  it('availability reports the same floated changes without applying them', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.0.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '^1.0.0' }],
    });
    await installModule(project, { name: 'B', version: '1.0.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/B.git@v1.2.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.2.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.0.0']],
      ['https://x/B.git', ['1.2.0', '1.0.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/B.git@v1.2.0', [['1.0.0', '1.2.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      { kind: 'availability' },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const b = result.changes.find((c) => c.module === 'B');
    expect(b).toMatchObject({ from: '1.0.0', to: '1.2.0' });
  });

  it('resolveForApply builds ResolvedModule[] for the moved cascade', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
      {
        name: 'C',
        location: 'https://x/C.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.6.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '>=1.3.0' }],
    });
    await installModule(project, {
      name: 'C',
      version: '1.2.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '~1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.8.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.8.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/C.git@v1.3.0',
        {
          cardKeyPrefix: 'C',
          name: 'C',
          version: '1.3.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/B.git@v1.4.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.4.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.8.0', '1.6.0']],
      ['https://x/C.git', ['1.3.0', '1.2.0']],
      ['https://x/B.git', ['1.4.0', '1.3.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
      ['https://x/C.git@v1.3.0', [['1.2.0', '1.3.0']]],
      ['https://x/B.git@v1.4.0', [['1.3.0', '1.4.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const { plan, resolved } = await resolveForApply(
      project,
      { kind: 'update', module: 'A', to: '1.8.0' as Version },
      { sourceLayer: source, tempDir: join(testDir, 'apply-fetch') },
    );

    expect(plan.ok).toBe(true);
    expect(resolved.map((r) => r.declaration.name).sort()).toEqual([
      'A',
      'B',
      'C',
    ]);

    const byName = new Map(resolved.map((r) => [r.declaration.name, r]));

    const a = byName.get('A')!;
    expect(a.declaration.parent).toBeUndefined();
    expect(a.declaration.versionRange).toBe('^1.0.0');
    expect(a.version).toBe('1.8.0');
    expect(a.ref).toBe('v1.8.0');

    const c = byName.get('C')!;
    expect(c.declaration.parent).toBeUndefined();
    expect(c.declaration.versionRange).toBe('^1.0.0');
    expect(c.version).toBe('1.3.0');
    expect(c.ref).toBe('v1.3.0');

    const b = byName.get('B')!;
    expect(b.declaration.parent).toBeDefined();
    expect(b.declaration.parent!.name).toMatch(/^(A|C)$/);
    expect(b.declaration.versionRange).toBeUndefined();
    expect(b.version).toBe('1.4.0');
    expect(b.ref).toBe('v1.4.0');

    for (const entry of resolved) {
      expect(
        existsSync(
          join(entry.stagedPath, '.cards', 'local', 'cardsConfig.json'),
        ),
      ).toBe(true);
    }
  });

  it('unversioned: fresh add of a file source installs as-is (to:null)', async () => {
    const project = buildProjectWithModules([]);

    // file: location ⇒ supportsVersioning false ⇒ no available versions ⇒
    // unversioned. The fake reads readMetadata(source, null) from the bare key.
    const configs = new Map<string, FakeModuleConfig>([
      [
        'file:/m/F',
        { cardKeyPrefix: 'F', name: 'F', modules: [] } as FakeModuleConfig,
      ],
    ]);
    const source = new InMemorySource(configs, new Map(), new Map(), new Map());

    const result = await resolve(
      project,
      {
        kind: 'add',
        name: 'F',
        source: { location: 'file:/m/F', private: false },
        range: undefined,
      },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const f = result.changes.find((c) => c.module === 'F');
    expect(f).toMatchObject({ module: 'F', from: null, to: null, replay: [] });
  });

  it('unversioned: fresh add pulls an unversioned transitive', async () => {
    const project = buildProjectWithModules([]);

    const configs = new Map<string, FakeModuleConfig>([
      [
        'file:/m/F',
        {
          cardKeyPrefix: 'F',
          name: 'F',
          modules: [{ name: 'G', location: 'file:/m/G', private: false }],
        } as FakeModuleConfig,
      ],
      [
        'file:/m/G',
        { cardKeyPrefix: 'G', name: 'G', modules: [] } as FakeModuleConfig,
      ],
    ]);
    const source = new InMemorySource(configs, new Map(), new Map(), new Map());

    const result = await resolve(
      project,
      {
        kind: 'add',
        name: 'F',
        source: { location: 'file:/m/F', private: false },
        range: undefined,
      },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byModule = new Map(result.changes.map((c) => [c.module, c]));
    expect(byModule.get('F')).toMatchObject({ from: null, to: null });
    expect(byModule.get('G')).toMatchObject({ from: null, to: null });
  });

  it('unversioned: a versioned root updates while its unversioned dep stays put', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.0.0',
      modules: [{ name: 'F', location: 'file:/m/F' }],
    });
    // Installed unversioned file module (no version in its config).
    {
      const dir = join(project.paths.modulesFolder, 'F');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'cardsConfig.json'),
        JSON.stringify({ name: 'F', cardKeyPrefix: 'F', modules: [] }),
      );
    }

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.1.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.1.0',
          modules: [{ name: 'F', location: 'file:/m/F', private: false }],
        } as FakeModuleConfig,
      ],
      [
        'file:/m/F',
        { cardKeyPrefix: 'F', name: 'F', modules: [] } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([['https://x/A.git', ['1.1.0', '1.0.0']]]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.1.0', [['1.0.0', '1.1.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      { kind: 'update', module: 'A' },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const a = result.changes.find((c) => c.module === 'A');
    expect(a).toMatchObject({ from: '1.0.0', to: '1.1.0' });
    expect(a!.replay).not.toEqual([]);
    // F is already installed and unchanged ⇒ no change emitted, and no conflict.
    expect(result.changes.find((c) => c.module === 'F')).toBeUndefined();
  });

  it('resolveForApply: a fresh unversioned add stages with no ref/version', async () => {
    const project = buildProjectWithModules([]);

    const configs = new Map<string, FakeModuleConfig>([
      [
        'file:/m/F',
        { cardKeyPrefix: 'F', name: 'F', modules: [] } as FakeModuleConfig,
      ],
    ]);
    const source = new InMemorySource(configs, new Map(), new Map(), new Map());

    const { plan, resolved } = await resolveForApply(
      project,
      {
        kind: 'add',
        name: 'F',
        source: { location: 'file:/m/F', private: false },
        range: undefined,
      },
      { sourceLayer: source, tempDir: join(testDir, 'apply-unversioned') },
    );
    expect(plan.ok).toBe(true);
    const f = resolved.find((r) => r.declaration.name === 'F');
    expect(f).toBeDefined();
    expect(f!.version).toBeUndefined();
    expect(f!.ref).toBeUndefined();
    expect(existsSync(f!.stagedPath)).toBe(true);
  });

  it('resolveForApply returns an empty plan on an unsatisfiable request', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
      {
        name: 'C',
        location: 'https://x/C.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'A',
      version: '1.6.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '>=1.3.0' }],
    });
    await installModule(project, {
      name: 'C',
      version: '1.2.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '~1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.8.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.8.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=2.0.0' },
          ],
        } as FakeModuleConfig,
      ],
      [
        'https://x/B.git@v2.0.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '2.0.0',
          modules: [],
        } as FakeModuleConfig,
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.8.0', '1.6.0']],
      ['https://x/C.git', ['1.2.0']],
      ['https://x/B.git', ['2.0.0', '1.3.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
      ['https://x/B.git@v2.0.0', [['1.3.0', '2.0.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const { plan, resolved } = await resolveForApply(
      project,
      { kind: 'update', module: 'A', to: '1.8.0' as Version },
      { sourceLayer: source, tempDir: join(testDir, 'apply-fetch-conflict') },
    );

    expect(plan.ok).toBe(false);
    expect(resolved).toEqual([]);
  });
});
