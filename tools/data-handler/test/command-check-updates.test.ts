import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { CheckUpdates } from '../src/commands/check-updates.js';
import type { ModuleSetting } from '../src/interfaces/project-interfaces.js';
import { getTestProject } from './helpers/test-utils.js';
import { InMemorySource, type FakeModuleConfig } from './modules/in-memory-source.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-check-updates-tests');
const minimalPath = join(testDir, 'valid/minimal');

// Build a project whose configuration.modules is whatever the test specifies.
// We call CheckUpdates directly against this project instead of routing
// through the CommandManager singleton, so each test starts from a known
// state without caring about cached instances.
function buildProjectWithModules(modules: ModuleSetting[]) {
  const project = getTestProject(minimalPath);
  project.configuration.modules.splice(
    0,
    project.configuration.modules.length,
    ...modules,
  );
  return project;
}

/**
 * Write a fake `.cards/modules/<name>/cardsConfig.json` so the inventory
 * layer reports `name` as an installation with the given version.
 */
function installModule(
  project: ReturnType<typeof getTestProject>,
  setup: {
    name: string;
    version?: string;
    cardKeyPrefix?: string;
    modules?: Array<{ name: string; location?: string; version?: string }>;
  },
) {
  const modulesFolder = project.paths.modulesFolder;
  const moduleDir = join(modulesFolder, setup.name);
  mkdirSync(moduleDir, { recursive: true });
  const config = {
    name: setup.name,
    cardKeyPrefix: setup.cardKeyPrefix ?? setup.name,
    description: '',
    modules: setup.modules ?? [],
    hubs: [],
    ...(setup.version ? { version: setup.version } : {}),
  };
  writeFileSync(
    join(moduleDir, 'cardsConfig.json'),
    JSON.stringify(config, null, 2),
  );
}

describe('check-updates', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    rmSync(minimalPath, { recursive: true, force: true });
    await copyDir(join(baseDir, 'test-data/valid/minimal'), minimalPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports update_available with a cascade when a newer version satisfies the range', async () => {
    const location = 'https://example.com/base.git';
    const project = buildProjectWithModules([
      { name: 'base', location, version: '^1.0.0', private: false },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    const configs = new Map<string, FakeModuleConfig>([
      [`${location}@v1.1.0`, { name: 'base', cardKeyPrefix: 'base', modules: [] }],
    ]);
    const available = new Map([[location, ['1.1.0', '1.0.0']]]);
    const seals = new Map([[`${location}@v1.1.0`, [['1.0.0', '1.1.0'] as [string, string]]]]);
    const source = new InMemorySource(configs, available, new Map(), seals);

    const [status] = await new CheckUpdates(project, source).checkUpdates();

    expect(status.name).toBe('base');
    expect(status.installedVersion).toBe('1.0.0');
    expect(status.isGitModule).toBe(true);
    expect(status.status).toBe('update_available');
    expect(status.reachableVersion).toBe('1.1.0');
    expect(status.cascade).toContainEqual({
      module: 'base',
      from: '1.0.0',
      to: '1.1.0',
    });
  });

  it('reports up_to_date when the installed version is the newest available', async () => {
    const location = 'https://example.com/base.git';
    const project = buildProjectWithModules([
      { name: 'base', location, version: '^1.0.0', private: false },
    ]);
    installModule(project, { name: 'base', version: '1.1.0' });

    const available = new Map([[location, ['1.1.0', '1.0.0']]]);
    const source = new InMemorySource(new Map(), available);

    const [status] = await new CheckUpdates(project, source).checkUpdates();

    expect(status.name).toBe('base');
    expect(status.installedVersion).toBe('1.1.0');
    expect(status.status).toBe('up_to_date');
    expect(status.reachableVersion).toBeUndefined();
  });

  it('reports blocked when the declared range matches no available version', async () => {
    const location = 'https://example.com/base.git';
    const project = buildProjectWithModules([
      { name: 'base', location, version: '^2.0.0', private: false },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    const available = new Map([[location, ['1.0.0']]]);
    const source = new InMemorySource(new Map(), available);

    const [status] = await new CheckUpdates(project, source).checkUpdates();

    expect(status.name).toBe('base');
    expect(status.status).toBe('blocked');
    expect(status.blocked).toBeDefined();
    expect(status.blocked!.length).toBeGreaterThan(0);
    expect(status.blocked!.some((c) => c.module === 'base')).toBe(true);
  });

  it('reports source_unreachable when the remote version listing throws', async () => {
    // An unreachable remote produces a `source_unreachable` row rather than
    // a silent "no update" — so callers can distinguish network failures
    // from true up-to-date modules.
    const location = 'https://example.com/base.git';
    const project = buildProjectWithModules([
      { name: 'base', location, version: '^1.0.0', private: false },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    const source = new InMemorySource(
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Set([location]),
    );

    const [status] = await new CheckUpdates(project, source).checkUpdates();

    expect(status.name).toBe('base');
    expect(status.isGitModule).toBe(true);
    expect(status.installedVersion).toBe('1.0.0');
    expect(status.status).toBe('source_unreachable');
  });

  it('marks non-git (local) modules as such and skips version checks', async () => {
    const location = 'file:/some/path';
    const project = buildProjectWithModules([
      { name: 'local-mod', location, private: false },
    ]);
    installModule(project, { name: 'local-mod', version: '1.0.0' });

    const source = new InMemorySource(new Map(), new Map());

    const [status] = await new CheckUpdates(project, source).checkUpdates();

    expect(status.isGitModule).toBe(false);
    // A local source is not versioned, so it cannot move.
    expect(status.status).toBe('up_to_date');
    expect(source.listLog).toEqual([]);
  });

  it('throws when a specific module name is not in the project', async () => {
    const project = buildProjectWithModules([]);
    const source = new InMemorySource(new Map(), new Map());

    await expect(
      new CheckUpdates(project, source).checkUpdates('nonexistent'),
    ).rejects.toThrow("Module 'nonexistent' is not part of the project");
  });

  it('throws naming the parent when asked about a transitive-only module', async () => {
    // `dep` is installed but has no top-level declaration — its lifetime
    // is owned by `host`. Checking updates for it must surface the parent
    // rather than misleadingly claim it is not part of the project.
    const project = buildProjectWithModules([
      { name: 'host', location: 'https://example.com/host.git', private: false },
    ]);
    installModule(project, {
      name: 'host',
      version: '1.0.0',
      modules: [{ name: 'dep' }],
    });
    installModule(project, { name: 'dep', version: '1.0.0' });

    const source = new InMemorySource(new Map(), new Map());

    await expect(
      new CheckUpdates(project, source).checkUpdates('dep'),
    ).rejects.toThrow(
      "Cannot check updates for module 'dep' because it is required by 'host'. Check updates for the parent module(s) instead.",
    );
  });

  it('returns one row per declared module when multiple modules are configured', async () => {
    const baseLoc = 'https://example.com/base.git';
    const extLoc = 'https://example.com/extension.git';
    const project = buildProjectWithModules([
      { name: 'base', location: baseLoc, version: '^1.0.0', private: false },
      { name: 'extension', location: extLoc, version: '^2.0.0', private: false },
    ]);
    installModule(project, { name: 'base', version: '1.0.0', cardKeyPrefix: 'base' });
    installModule(project, {
      name: 'extension',
      version: '2.0.0',
      cardKeyPrefix: 'ext',
    });

    const available = new Map([
      [baseLoc, ['1.0.0']],
      [extLoc, ['2.0.0']],
    ]);
    const source = new InMemorySource(new Map(), available);

    const statuses = await new CheckUpdates(project, source).checkUpdates();

    expect(statuses.map((s) => s.name).sort()).toEqual(['base', 'extension']);
  });

  it('checks only the named module when a name is supplied', async () => {
    const baseLoc = 'https://example.com/base.git';
    const extLoc = 'https://example.com/extension.git';
    const project = buildProjectWithModules([
      { name: 'base', location: baseLoc, version: '^1.0.0', private: false },
      { name: 'extension', location: extLoc, version: '^2.0.0', private: false },
    ]);
    installModule(project, { name: 'base', version: '1.0.0', cardKeyPrefix: 'base' });
    installModule(project, {
      name: 'extension',
      version: '2.0.0',
      cardKeyPrefix: 'ext',
    });

    const available = new Map([
      [baseLoc, ['1.0.0']],
      [extLoc, ['2.0.0']],
    ]);
    const source = new InMemorySource(new Map(), available);

    const statuses = await new CheckUpdates(project, source).checkUpdates('base');

    expect(statuses).toHaveLength(1);
    expect(statuses[0].name).toBe('base');
  });
});
