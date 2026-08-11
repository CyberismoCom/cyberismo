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
import { conflictReason } from '../../../src/modules/resolve/format.js';
import type { Version, VersionRange } from '../../../src/modules/types.js';
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

/**
 * Roots A and C both pinned `^1.0.0`; installed A 1.6.0 (B>=1.3.0) and
 * C 1.2.0 (B~1.3.0) over B 1.3.0. A 1.8.0 needs B>=1.4.0, and the only C
 * that tolerates B 1.4.0 is 2.0.0 — outside C's own pin. Every move is
 * sealed, so replayability never prunes: whatever the engine refuses here,
 * it refuses on the pin.
 */
async function buildOutOfPinFixture() {
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
      },
    ],
    [
      'https://x/C.git@v2.0.0',
      {
        cardKeyPrefix: 'C',
        name: 'C',
        version: '2.0.0',
        modules: [
          { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
        ],
      },
    ],
    [
      'https://x/B.git@v1.4.0',
      {
        cardKeyPrefix: 'B',
        name: 'B',
        version: '1.4.0',
        modules: [],
      },
    ],
  ]);
  const available = new Map([
    ['https://x/A.git', ['1.8.0', '1.6.0']],
    ['https://x/C.git', ['2.0.0', '1.2.0']],
    ['https://x/B.git', ['1.4.0', '1.3.0']],
  ]);
  const seals = new Map<string, Array<[string, string]>>([
    ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
    ['https://x/C.git@v2.0.0', [['1.2.0', '2.0.0']]],
    ['https://x/B.git@v1.4.0', [['1.3.0', '1.4.0']]],
  ]);
  return {
    project,
    source: new InMemorySource(configs, available, new Map(), seals),
  };
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
        },
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
        },
      ],
      [
        'https://x/B.git@v1.4.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.4.0',
          modules: [],
        },
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

  it('a forced bystander moves the smallest step that works', async () => {
    // Both C 1.3.0 and C 1.5.0 tolerate B 1.4.0 and sit inside C's own pin, so
    // the cascade has a choice. It has to take 1.3.0 — the least disturbance to
    // a module the user never asked to move.
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
        },
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
        },
      ],
      [
        'https://x/C.git@v1.5.0',
        {
          cardKeyPrefix: 'C',
          name: 'C',
          version: '1.5.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        },
      ],
      [
        'https://x/B.git@v1.4.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.4.0',
          modules: [],
        },
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.8.0', '1.6.0']],
      ['https://x/C.git', ['1.5.0', '1.3.0', '1.2.0']],
      ['https://x/B.git', ['1.4.0', '1.3.0']],
    ]);
    // 1.5.0 is sealed too, so it stays a genuine alternative: nothing but the
    // smallest-step preference keeps the plan off it.
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
      ['https://x/C.git@v1.3.0', [['1.2.0', '1.3.0']]],
      ['https://x/C.git@v1.5.0', [['1.2.0', '1.5.0']]],
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
        },
      ],
      [
        'https://x/B.git@v2.0.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '2.0.0',
          modules: [],
        },
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
    // Nothing here is fixable from the project config — no C exists that would
    // satisfy B — so no pin is reported, and the frames A and C failed on
    // while backtracking carry nothing and are dropped.
    expect(result.conflicts.map((c) => c.module)).toEqual(['B']);
  });

  it('surgical update refuses to push a bystander past its own declared pin', async () => {
    // The engine must not take C's out-of-pin escape hatch to dodge the
    // conflict: a bystander's own pin is a hard constraint, so this reports
    // the same B conflict as the unsatisfiable case rather than moving C.
    const { project, source } = await buildOutOfPinFixture();

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
    // Unlike the unsatisfiable case this one IS fixable from the project
    // config, so the refusal has to say which pin to widen and to what.
    expect(result.conflicts.find((c) => c.module === 'C')?.pinned).toEqual({
      range: '^1.0.0',
      wouldNeed: '2.0.0',
    });
  });

  it('a pin block cites the lowest blocked version, not the highest', async () => {
    // The out-of-pin fixture with a second escape hatch: C 2.0.0 and C 3.0.0
    // both tolerate B 1.4.0 and both sit outside C's ^1.0.0. The refusal has to
    // name 2.0.0 — the smallest widening that would unblock the tree.
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
        },
      ],
      [
        'https://x/C.git@v2.0.0',
        {
          cardKeyPrefix: 'C',
          name: 'C',
          version: '2.0.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        },
      ],
      [
        'https://x/C.git@v3.0.0',
        {
          cardKeyPrefix: 'C',
          name: 'C',
          version: '3.0.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        },
      ],
      [
        'https://x/B.git@v1.4.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.4.0',
          modules: [],
        },
      ],
    ]);
    const available = new Map([
      ['https://x/A.git', ['1.8.0', '1.6.0']],
      ['https://x/C.git', ['3.0.0', '2.0.0', '1.2.0']],
      ['https://x/B.git', ['1.4.0', '1.3.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/A.git@v1.8.0', [['1.6.0', '1.8.0']]],
      ['https://x/C.git@v2.0.0', [['1.2.0', '2.0.0']]],
      ['https://x/C.git@v3.0.0', [['1.2.0', '3.0.0']]],
      ['https://x/B.git@v1.4.0', [['1.3.0', '1.4.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      { kind: 'update', module: 'A', to: '1.8.0' as Version },
      { sourceLayer: source, tempDir: testDir },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.conflicts.find((c) => c.module === 'C')?.pinned).toEqual({
      range: '^1.0.0',
      wouldNeed: '2.0.0',
    });
  });

  it('availability reports no reachable update when the only path breaks a pin', async () => {
    // A 1.8.0 satisfies A's own ^1.0.0, but reaching it needs C past its
    // pin. The engine backtracks to A's installed 1.6.0 and succeeds with an
    // empty plan, which check-updates renders as up-to-date — the pin that
    // held A back is not reported anywhere.
    const { project, source } = await buildOutOfPinFixture();

    const result = await resolve(
      project,
      { kind: 'availability', module: 'A' },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([]);
  });

  it('fresh import refuses to push a bystander past its own declared pin', async () => {
    // Importing D drags B to >=1.4.0. The only C that tolerates that is
    // 2.0.0, outside C's declared ^1.0.0, so the import must fail rather
    // than silently re-pinning a module the user never mentioned.
    const project = buildProjectWithModules([
      {
        name: 'C',
        location: 'https://x/C.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'C',
      version: '1.2.0',
      modules: [{ name: 'B', location: 'https://x/B.git', version: '~1.3.0' }],
    });
    await installModule(project, { name: 'B', version: '1.3.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/D.git@v1.0.0',
        {
          cardKeyPrefix: 'D',
          name: 'D',
          version: '1.0.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        },
      ],
      [
        'https://x/C.git@v2.0.0',
        {
          cardKeyPrefix: 'C',
          name: 'C',
          version: '2.0.0',
          modules: [
            { name: 'B', location: 'https://x/B.git', version: '>=1.4.0' },
          ],
        },
      ],
      [
        'https://x/B.git@v1.4.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.4.0',
          modules: [],
        },
      ],
    ]);
    const available = new Map([
      ['https://x/D.git', ['1.0.0']],
      ['https://x/C.git', ['2.0.0', '1.2.0']],
      ['https://x/B.git', ['1.4.0', '1.3.0']],
    ]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/C.git@v2.0.0', [['1.2.0', '2.0.0']]],
      ['https://x/B.git@v1.4.0', [['1.3.0', '1.4.0']]],
    ]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const result = await resolve(
      project,
      {
        kind: 'add',
        name: 'D',
        source: { location: 'https://x/D.git', private: false },
        range: undefined,
      },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const bConflict = result.conflicts.find((c) => c.module === 'B');
    expect(bConflict).toBeDefined();
    const froms = new Set(bConflict!.demands.map((d) => d.from));
    expect(froms.has('D')).toBe(true);
    expect(froms.has('C')).toBe(true);
    expect(result.conflicts.find((c) => c.module === 'C')?.pinned).toEqual({
      range: '^1.0.0',
      wouldNeed: '2.0.0',
    });
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
        },
      ],
      [
        'https://x/B.git@v1.5.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.5.0',
          modules: [],
        },
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
    if (result.ok) return;
    // The refusal names the replay gap instead of a generic no-version.
    const bConflict = result.conflicts.find((c) => c.module === 'B');
    expect(bConflict?.nonReplayable).toEqual({ from: '1.3.0', to: '1.5.0' });
  });

  it('update to an explicit version without a replay path names the gap', async () => {
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, { name: 'A', version: '1.6.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/A.git@v1.8.0',
        {
          cardKeyPrefix: 'A',
          name: 'A',
          version: '1.8.0',
          modules: [],
        },
      ],
    ]);
    const available = new Map([['https://x/A.git', ['1.8.0', '1.6.0']]]);
    // No seals anywhere: the 1.6.0 → 1.8.0 move cannot be replayed.
    const source = new InMemorySource(configs, available);

    const result = await resolve(
      project,
      { kind: 'update', module: 'A', to: '1.8.0' as Version },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.conflicts).toEqual([
      {
        module: 'A',
        demands: [],
        nonReplayable: { from: '1.6.0', to: '1.8.0' },
      },
    ]);
  });

  it('availability: an unreachable bystander is frozen, not fatal', async () => {
    // R1's remote is down; asking about R2 must still answer. Asking about
    // R1 itself still surfaces the failure so check-updates can report
    // source_unreachable rather than a false up-to-date.
    const project = buildProjectWithModules([
      {
        name: 'R1',
        location: 'https://x/R1.git',
        version: '^1.0.0',
        private: false,
      },
      {
        name: 'R2',
        location: 'https://x/R2.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, { name: 'R1', version: '1.0.0' });
    await installModule(project, { name: 'R2', version: '1.0.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/R2.git@v1.1.0',
        {
          cardKeyPrefix: 'R2',
          name: 'R2',
          version: '1.1.0',
          modules: [],
        },
      ],
    ]);
    const available = new Map([['https://x/R2.git', ['1.1.0', '1.0.0']]]);
    const seals = new Map<string, Array<[string, string]>>([
      ['https://x/R2.git@v1.1.0', [['1.0.0', '1.1.0']]],
    ]);
    const source = new InMemorySource(
      configs,
      available,
      new Map(),
      seals,
      new Set(['https://x/R1.git']),
    );

    const result = await resolve(
      project,
      { kind: 'availability', module: 'R2' },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changes).toEqual([
      {
        module: 'R2',
        from: '1.0.0',
        to: '1.1.0',
        replay: [
          {
            from: '1.0.0',
            to: '1.1.0',
            fileName: 'migrationLog_1.0.0_1.1.0.jsonl',
          },
        ],
      },
    ]);

    await expect(
      resolve(
        project,
        { kind: 'availability', module: 'R1' },
        { sourceLayer: source, tempDir: testDir },
      ),
    ).rejects.toThrow('remote unreachable');
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
        },
      ],
      [
        'https://x/D.git@v1.0.0',
        {
          cardKeyPrefix: 'D',
          name: 'D',
          version: '1.0.0',
          modules: [],
        },
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
        },
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
        },
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
        },
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
        },
      ],
      [
        'https://x/B.git@v1.4.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '1.4.0',
          modules: [],
        },
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
      ['file:/m/F', { cardKeyPrefix: 'F', name: 'F', modules: [] }],
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
        },
      ],
      ['file:/m/G', { cardKeyPrefix: 'G', name: 'G', modules: [] }],
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
        },
      ],
      ['file:/m/F', { cardKeyPrefix: 'F', name: 'F', modules: [] }],
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
      ['file:/m/F', { cardKeyPrefix: 'F', name: 'F', modules: [] }],
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

  it('injected sourceLayer is NOT disposed by resolve or resolveForApply', async () => {
    // Regression: resolve/resolveForApply must NOT call dispose on a caller-injected
    // layer — the caller owns disposal. An injected fake whose dispose throws would
    // propagate and fail the test if the contract is broken.
    const project = buildProjectWithModules([
      {
        name: 'A',
        location: 'https://x/A.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    await installModule(project, { name: 'A', version: '1.0.0' });

    const source = new InMemorySource(
      new Map(),
      new Map([['https://x/A.git', ['1.0.0']]]),
    );
    let disposeCallCount = 0;
    (source as unknown as { dispose: () => Promise<void> }).dispose =
      async () => {
        disposeCallCount++;
      };

    await resolve(
      project,
      { kind: 'verify' },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(disposeCallCount, 'resolve must not dispose an injected layer').toBe(
      0,
    );

    await resolveForApply(
      project,
      { kind: 'verify' },
      { sourceLayer: source, tempDir: testDir },
    );
    expect(
      disposeCallCount,
      'resolveForApply must not dispose an injected layer',
    ).toBe(0);
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
        },
      ],
      [
        'https://x/B.git@v2.0.0',
        {
          cardKeyPrefix: 'B',
          name: 'B',
          version: '2.0.0',
          modules: [],
        },
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

  it('add: an undemanded bystander contributes no pin frame to the refusal', async () => {
    const project = buildProjectWithModules([
      {
        name: 'E',
        location: 'https://x/E.git',
        version: '^1.4.0',
        private: false,
      },
    ]);
    await installModule(project, {
      name: 'E',
      version: '1.4.0',
      modules: [{ name: 'C', location: 'https://x/C.git', version: '1.0.0' }],
    });
    await installModule(project, { name: 'C', version: '1.0.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [
        'https://x/L.git@v2.0.0',
        {
          cardKeyPrefix: 'L',
          name: 'L',
          version: '2.0.0',
          modules: [
            { name: 'C', location: 'https://x/C.git', version: '~1.1.0' },
          ],
        },
      ],
    ]);
    const available = new Map([
      ['https://x/E.git', ['1.4.0', '1.0.0']],
      ['https://x/L.git', ['2.0.0', '1.0.0']],
      ['https://x/C.git', ['1.1.0', '1.0.0']],
    ]);
    const source = new InMemorySource(configs, available);

    const result = await resolve(
      project,
      {
        kind: 'add',
        name: 'L',
        source: { location: 'https://x/L.git', private: false },
        range: '2.0.0' as VersionRange,
      },
      { sourceLayer: source, tempDir: testDir },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // C (the genuinely over-constrained dep) and L (whose pin excludes the
    // workable 1.0.0) explain the refusal; bystander E, which nothing
    // demanded to move, must not surface a frame.
    expect(result.conflicts.map((c) => c.module).sort()).toEqual(['C', 'L']);
    const c = result.conflicts.find((x) => x.module === 'C')!;
    expect(c.demands).toHaveLength(2);
    const l = result.conflicts.find((x) => x.module === 'L')!;
    expect(l.pinned).toEqual({ range: '2.0.0', wouldNeed: '1.0.0' });
  });

  describe('refusals for a module drifted above its range', () => {
    it('update: a downgrade refusal cites the nearest version, not the oldest', async () => {
      const project = buildProjectWithModules([
        {
          name: 'A',
          location: 'https://x/A.git',
          version: '^1.0.0',
          private: false,
        },
      ]);
      await installModule(project, { name: 'A', version: '2.0.0' });

      const source = new InMemorySource(
        new Map(),
        new Map([['https://x/A.git', ['1.3.0', '1.2.0', '1.0.0']]]),
      );
      const result = await resolve(
        project,
        { kind: 'update', module: 'A' },
        { sourceLayer: source, tempDir: testDir },
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].downgrade).toEqual({
        from: '2.0.0',
        to: '1.3.0',
      });
    });

    it('update: a downgrade does not mask a coexisting pin block', async () => {
      const project = buildProjectWithModules([
        {
          name: 'C',
          location: 'https://x/C.git',
          version: '^1.0.0',
          private: false,
        },
      ]);
      await installModule(project, { name: 'C', version: '2.0.0' });

      const source = new InMemorySource(
        new Map(),
        new Map([['https://x/C.git', ['2.5.0', '1.3.0']]]),
      );
      const result = await resolve(
        project,
        { kind: 'update', module: 'C' },
        { sourceLayer: source, tempDir: testDir },
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].downgrade).toEqual({
        from: '2.0.0',
        to: '1.3.0',
      });
      expect(result.conflicts[0].pinned).toEqual({
        range: '^1.0.0',
        wouldNeed: '2.5.0',
      });
      const reason = conflictReason(result.conflicts[0]);
      expect(reason).toContain('cannot downgrade from 2.0.0 to 1.3.0');
      expect(reason).toContain(
        "declared as '^1.0.0' in this project, but 2.5.0 is needed",
      );
    });
  });

  describe('missing version defaults to 1.x', () => {
    it('update: a root declared without a version stays within 1.x', async () => {
      const project = buildProjectWithModules([
        { name: 'A', location: 'https://x/A.git', private: false },
      ]);
      await installModule(project, { name: 'A', version: '1.2.0' });

      const configs = new Map<string, FakeModuleConfig>([
        [
          'https://x/A.git@v1.6.0',
          { cardKeyPrefix: 'A', name: 'A', version: '1.6.0', modules: [] },
        ],
        [
          'https://x/A.git@v2.0.0',
          { cardKeyPrefix: 'A', name: 'A', version: '2.0.0', modules: [] },
        ],
      ]);
      const available = new Map([
        ['https://x/A.git', ['2.0.0', '1.6.0', '1.2.0']],
      ]);
      // Both moves are sealed, so the assumed range is the only discriminator.
      const seals = new Map<string, Array<[string, string]>>([
        ['https://x/A.git@v1.6.0', [['1.2.0', '1.6.0']]],
        ['https://x/A.git@v2.0.0', [['1.2.0', '2.0.0']]],
      ]);
      const source = new InMemorySource(configs, available, new Map(), seals);

      const result = await resolve(
        project,
        { kind: 'update', module: 'A' },
        { sourceLayer: source, tempDir: testDir },
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.changes).toHaveLength(1);
      expect(result.changes[0]).toMatchObject({
        module: 'A',
        from: '1.2.0',
        to: '1.6.0',
      });
    });

    it('updateAll: a dependency edge without a version demands 1.x', async () => {
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
        modules: [{ name: 'B', location: 'https://x/B.git' }],
      });
      await installModule(project, { name: 'B', version: '1.0.0' });

      const configs = new Map<string, FakeModuleConfig>([
        [
          'https://x/B.git@v1.5.0',
          { cardKeyPrefix: 'B', name: 'B', version: '1.5.0', modules: [] },
        ],
        [
          'https://x/B.git@v2.0.0',
          { cardKeyPrefix: 'B', name: 'B', version: '2.0.0', modules: [] },
        ],
      ]);
      const available = new Map([
        ['https://x/A.git', ['1.0.0']],
        ['https://x/B.git', ['2.0.0', '1.5.0', '1.0.0']],
      ]);
      // Both moves are sealed, so the assumed range is the only discriminator.
      const seals = new Map<string, Array<[string, string]>>([
        ['https://x/B.git@v1.5.0', [['1.0.0', '1.5.0']]],
        ['https://x/B.git@v2.0.0', [['1.0.0', '2.0.0']]],
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
      expect(b).toMatchObject({ from: '1.0.0', to: '1.5.0' });
    });

    it('availability: a pin conflict names the assumed 1.x range', async () => {
      const project = buildProjectWithModules([
        { name: 'E', location: 'https://x/E.git', private: false },
      ]);
      await installModule(project, { name: 'E', version: '1.0.0' });

      const configs = new Map<string, FakeModuleConfig>([
        [
          'https://x/E.git@v2.0.0',
          { cardKeyPrefix: 'E', name: 'E', version: '2.0.0', modules: [] },
        ],
      ]);
      const available = new Map([['https://x/E.git', ['2.0.0']]]);
      const seals = new Map<string, Array<[string, string]>>([
        ['https://x/E.git@v2.0.0', [['1.0.0', '2.0.0']]],
      ]);
      const source = new InMemorySource(configs, available, new Map(), seals);

      const result = await resolve(
        project,
        { kind: 'availability', module: 'E' },
        { sourceLayer: source, tempDir: testDir },
      );

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].pinned).toEqual({
        range: '1.x',
        wouldNeed: '2.0.0',
        assumed: true,
      });
      expect(conflictReason(result.conflicts[0])).toContain("assumed '1.x'");
    });

    it('verify: an installed root outside the assumed 1.x is not flagged', async () => {
      const project = buildProjectWithModules([
        { name: 'G', location: 'https://x/G.git', private: false },
      ]);
      await installModule(project, { name: 'G', version: '2.0.0' });

      const source = new InMemorySource(
        new Map(),
        new Map([['https://x/G.git', ['2.0.0']]]),
      );
      const result = await resolve(
        project,
        { kind: 'verify' },
        { sourceLayer: source, tempDir: testDir },
      );

      expect(result).toEqual({ ok: true, changes: [] });
    });

    it('update: a bystander outside the assumed 1.x keeps its installed version', async () => {
      const project = buildProjectWithModules([
        {
          name: 'A',
          location: 'https://x/A.git',
          version: '^1.0.0',
          private: false,
        },
        { name: 'H', location: 'https://x/H.git', private: false },
      ]);
      await installModule(project, { name: 'A', version: '1.0.0' });
      await installModule(project, { name: 'H', version: '2.0.0' });

      const configs = new Map<string, FakeModuleConfig>([
        [
          'https://x/A.git@v1.1.0',
          { cardKeyPrefix: 'A', name: 'A', version: '1.1.0', modules: [] },
        ],
      ]);
      const available = new Map([
        ['https://x/A.git', ['1.1.0', '1.0.0']],
        ['https://x/H.git', ['2.0.0', '1.0.0']],
      ]);
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
      expect(result.changes.map((c) => c.module)).toEqual(['A']);
    });
  });
});
