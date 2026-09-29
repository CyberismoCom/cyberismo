import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveUpdate, toUpdatePlan } from '../../src/modules/update-plan.js';
import { makeProjectStub } from '../helpers/module-fixtures.js';
import { InMemorySource, type FakeModuleConfig } from './in-memory-source.js';
import type {
  Credentials,
  ModuleSetting,
  UpdatePlan,
  UpdateTarget,
} from '../../src/interfaces/project-interfaces.js';
import type { Project } from '../../src/containers/project.js';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'update-plan-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const planFor = async (
  project: Project,
  target: UpdateTarget,
  opts: { source: InMemorySource; credentials?: Credentials },
) => toUpdatePlan(project, await resolveUpdate(project, target, opts));

const loc = (name: string) => `https://x/${name}.git`;

// A remote per module: its tags, the seals each version carries (`to` ->
// `from`s) and whether listing it fails.
function fakeRemote(
  remotes: Record<
    string,
    {
      versions: string[];
      seals?: Record<string, string[]>;
      // Dependencies each version declares.
      deps?: Record<string, { name: string; version: string }[]>;
      down?: true;
    }
  >,
) {
  const seals = new Map<string, [string, string][]>();
  for (const [name, r] of Object.entries(remotes)) {
    for (const [to, froms] of Object.entries(r.seals ?? {})) {
      seals.set(
        `${loc(name)}@v${to}`,
        froms.map((from) => [from, to] as [string, string]),
      );
    }
  }
  const configs = new Map<string, FakeModuleConfig>();
  for (const [name, r] of Object.entries(remotes)) {
    for (const [ver, deps] of Object.entries(r.deps ?? {})) {
      configs.set(`${loc(name)}@v${ver}`, {
        cardKeyPrefix: name,
        modules: deps.map((d) => ({ ...d, location: loc(d.name) })),
      });
    }
  }
  return new InMemorySource(
    configs,
    new Map(Object.entries(remotes).map(([n, r]) => [loc(n), r.versions])),
    new Map(),
    seals,
    new Set(
      Object.entries(remotes)
        .filter(([, r]) => r.down)
        .map(([n]) => loc(n)),
    ),
  );
}

// Writes the installed copy of a module; `modules` are its own declarations.
async function install(
  name: string,
  version = '1.0.0',
  modules: { name: string; version: string; private?: boolean }[] = [],
) {
  const modDir = join(dir, '.cards', 'modules', name);
  await mkdir(modDir, { recursive: true });
  await writeFile(
    join(modDir, 'cardsConfig.json'),
    JSON.stringify({
      cardKeyPrefix: name,
      version,
      modules: modules.map((m) => ({ ...m, location: loc(m.name) })),
    }),
  );
}

async function setup(roots: ModuleSetting[]) {
  const { project } = makeProjectStub({ basePath: dir, modules: roots });
  for (const { name } of roots) await install(name);
  return project;
}

const root = (name: string, version?: string): ModuleSetting => ({
  name,
  location: loc(name),
  private: false,
  ...(version ? { version } : {}),
});

describe('update plan', () => {
  it('reports latest and held-back from the solve’s own listing', async () => {
    const project = await setup([
      root('asm'),
      root('car', '^1.0.0'),
      root('pin', '1.0.0'),
    ]);
    const source = fakeRemote({
      asm: { versions: ['1.0.0', '2.0.0'] },
      car: {
        versions: ['1.0.0', '1.3.0', '2.0.0'],
        seals: { '1.3.0': ['1.0.0'] },
      },
      pin: { versions: ['1.0.0', '1.1.0'] },
    });

    const plan = await planFor(project, {}, { source });

    expect(plan.changes).toEqual([
      { module: 'car', from: '1.0.0', to: '1.3.0', breaking: false },
    ]);
    const row = (m: string) => plan.roots.find((r) => r.module === m);
    expect(row('pin')).toMatchObject({ latest: '1.1.0', heldBack: true });
    expect(row('car')).toMatchObject({ latest: '2.0.0', heldBack: true });
    expect(row('asm')).toMatchObject({
      range: '1.x',
      latest: '2.0.0',
      heldBack: true,
      versionSource: 'git',
    });
    expect(source.fetchLog).toEqual([]);
  });

  it('lists a private module with credentials for an explicit version', async () => {
    const project = await setup([{ ...root('priv', '^1.0.0'), private: true }]);
    const source = fakeRemote({
      priv: { versions: ['1.0.0', '1.1.0'], seals: { '1.1.0': ['1.0.0'] } },
    });

    await planFor(
      project,
      { module: 'priv', version: '1.1.0' },
      { source: source, credentials: { username: 'u', token: 't' } },
    );

    expect(source.listUrlLog[0]).toContain('u:t@');
  });

  describe('private modules', () => {
    const privRoot = (name = 'priv') => ({
      ...root(name, '^1.0.0'),
      private: true,
    });
    const bump = {
      versions: ['1.0.0', '1.1.0'],
      seals: { '1.1.0': ['1.0.0'] },
    };
    const row = (plan: UpdatePlan, m: string) =>
      plan.roots.find((r) => r.module === m);

    it('holds a private root whose listing fails and marks it unchecked', async () => {
      const project = await setup([privRoot(), root('pub', '^1.0.0')]);
      const source = fakeRemote({
        priv: { ...bump, down: true },
        pub: bump,
      });

      const plan = await planFor(project, {}, { source });

      expect(plan.changes).toEqual([
        { module: 'pub', from: '1.0.0', to: '1.1.0', breaking: false },
      ]);
      expect(plan.unchecked).toEqual(['priv']);
      expect(row(plan, 'priv')).toMatchObject({
        installed: '1.0.0',
        latest: null,
        heldBack: false,
        unchecked: true,
      });
      expect(row(plan, 'pub')?.unchecked).toBeUndefined();
    });

    it('moves a private root whose listing succeeds without credentials', async () => {
      const project = await setup([privRoot()]);
      const source = fakeRemote({ priv: bump });

      const plan = await planFor(project, {}, { source });

      expect(source.listLog).toEqual([loc('priv')]);
      expect(plan.changes).toEqual([
        { module: 'priv', from: '1.0.0', to: '1.1.0', breaking: false },
      ]);
      expect(plan.unchecked).toEqual([]);
      expect(row(plan, 'priv')?.unchecked).toBeUndefined();
    });

    it('reports a held private transitive of a public root', async () => {
      const project = await setup([root('pub', '^1.0.0')]);
      await install('pub', '1.0.0', [
        { name: 'dep', version: '^1.0.0', private: true },
      ]);
      await install('dep');
      const source = fakeRemote({
        pub: {
          ...bump,
          deps: { '1.1.0': [{ name: 'dep', version: '^1.0.0' }] },
        },
        dep: { ...bump, down: true },
      });

      const plan = await planFor(project, {}, { source });

      expect(plan.unchecked).toEqual(['dep']);
      expect(plan.changes.map((c) => c.module)).toEqual(['pub']);
    });

    it('never holds the module the request names', async () => {
      const project = await setup([privRoot()]);
      const source = fakeRemote({ priv: { ...bump, down: true } });

      await expect(
        planFor(project, { module: 'priv' }, { source }),
      ).rejects.toMatchObject({ reason: 'unreachable' });
    });

    it('keeps a held root’s dependencies binding on the others', async () => {
      // `other` 1.1.0 needs lib ^2, which the held `priv` (lib ^1) rules out.
      const project = await setup([root('other', '^1.0.0'), privRoot()]);
      await install('priv', '1.0.0', [{ name: 'lib', version: '^1.0.0' }]);
      const source = fakeRemote({
        other: {
          ...bump,
          deps: { '1.1.0': [{ name: 'lib', version: '^2.0.0' }] },
        },
        priv: { ...bump, down: true },
        lib: { versions: ['1.0.0', '2.0.0'] },
      });

      const plan = await planFor(project, {}, { source });

      expect(plan.ok).toBe(true);
      expect(plan.changes.find((c) => c.module === 'other')).toBeUndefined();
      expect(plan.changes.find((c) => c.module === 'lib')?.to).toBe('1.0.0');
    });
  });

  it('keeps a root installed at a prerelease in place', async () => {
    const project = await setup([root('base', '^1.0.0')]);
    await install('base', '1.3.0-rc.1');
    const source = fakeRemote({ base: { versions: ['1.0.0', '1.2.0'] } });

    const plan = await planFor(project, {}, { source });

    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([]);
  });

  describe('refusals', () => {
    it('reports an undeclared module as not found', async () => {
      const project = await setup([root('base')]);
      await expect(
        planFor(project, { module: 'ghost' }, { source: fakeRemote({}) }),
      ).rejects.toMatchObject({
        reason: 'notFound',
        message: "Module 'ghost' is not part of the project",
      });
    });

    it('refuses a transitive module and names its parents', async () => {
      const project = await setup([root('parent')]);
      await writeFile(
        join(dir, '.cards', 'modules', 'parent', 'cardsConfig.json'),
        JSON.stringify({
          cardKeyPrefix: 'parent',
          version: '1.0.0',
          modules: [{ name: 'kid', location: loc('kid') }],
        }),
      );
      await mkdir(join(dir, '.cards', 'modules', 'kid'), { recursive: true });
      await writeFile(
        join(dir, '.cards', 'modules', 'kid', 'cardsConfig.json'),
        JSON.stringify({ cardKeyPrefix: 'kid', version: '1.0.0', modules: [] }),
      );
      await expect(
        planFor(project, { module: 'kid' }, { source: fakeRemote({}) }),
      ).rejects.toMatchObject({
        reason: 'invalid',
        message:
          "Cannot update module 'kid' because it is required by 'parent'. Update the parent module(s) instead.",
      });
    });

    it('reports an unreachable remote for an explicit version', async () => {
      const project = await setup([root('base', '^1.0.0')]);
      await expect(
        planFor(
          project,
          { module: 'base', version: '1.1.0' },
          { source: fakeRemote({ base: { versions: [], down: true } }) },
        ),
      ).rejects.toMatchObject({ reason: 'unreachable' });
    });
  });

  describe('range target', () => {
    const source = () =>
      fakeRemote({
        base: { versions: ['1.0.0', '2.0.0'], seals: { '2.0.0': ['1.0.0'] } },
      });

    it('refuses a blank range', async () => {
      const project = await setup([root('base', '^1.0.0')]);
      await expect(
        planFor(project, { module: 'base', range: '  ' }, { source: source() }),
      ).rejects.toThrow('Version range cannot be empty');
    });

    it('re-declares the range and moves across it', async () => {
      const project = await setup([root('base', '^1.0.0')]);
      const plan = await planFor(
        project,
        { module: 'base', range: '^2.0.0' },
        { source: source() },
      );
      expect(plan.changes).toEqual([
        { module: 'base', from: '1.0.0', to: '2.0.0', breaking: true },
      ]);
      expect(plan.rangeWrites).toEqual([{ module: 'base', range: '^2.0.0' }]);
      expect(plan.roots[0]).toMatchObject({ range: '^2.0.0', heldBack: false });
    });

    it('reports no change when the version stays', async () => {
      const project = await setup([root('base', '1.0.0')]);
      const plan = await planFor(
        project,
        { module: 'base', range: '~1.0.0' },
        { source: source() },
      );
      expect(plan.changes).toEqual([]);
    });
  });
});
