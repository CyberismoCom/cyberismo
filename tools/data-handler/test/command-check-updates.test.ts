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
import { GitManager } from '../src/utils/git-manager.js';
import type { ModuleSetting } from '../src/interfaces/project-interfaces.js';
import { getTestProject } from './helpers/test-utils.js';

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
  },
) {
  const modulesFolder = project.paths.modulesFolder;
  const moduleDir = join(modulesFolder, setup.name);
  mkdirSync(moduleDir, { recursive: true });
  const config = {
    name: setup.name,
    cardKeyPrefix: setup.cardKeyPrefix ?? setup.name,
    description: '',
    modules: [],
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

  it('reports update available when a newer version satisfies the range constraint', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '1.0.1',
      '1.0.0',
    ]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.name).toBe('base');
    expect(status.installedVersion).toBe('1.0.0');
    expect(status.latestVersion).toBe('1.0.1');
    expect(status.latestSatisfyingConstraint).toBe('1.0.1');
    expect(status.updateAvailable).toBe(true);
    expect(status.constraintBlocksUpdate).toBe(false);
    expect(status.status).toBe('update_available');
  });

  it('still surfaces the absolute latest when an exact pin blocks auto-update', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        // bare "1.0.0" is treated by semver as an exact pin (=1.0.0)
        version: '1.0.0',
        private: false,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '1.0.1',
      '1.0.0',
    ]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.latestVersion).toBe('1.0.1');
    expect(status.latestSatisfyingConstraint).toBe('1.0.0');
    expect(status.updateAvailable).toBe(true);
    expect(status.constraintBlocksUpdate).toBe(true);
    expect(status.status).toBe('range_blocks_update');
  });

  it('reports up-to-date when the installed version matches the latest', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.1' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '1.0.1',
      '1.0.0',
    ]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.installedVersion).toBe('1.0.1');
    expect(status.latestVersion).toBe('1.0.1');
    expect(status.updateAvailable).toBe(false);
    expect(status.constraintBlocksUpdate).toBe(false);
    expect(status.status).toBe('up_to_date');
  });

  it('flags noMatchingVersion when the constraint excludes every remote tag', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^3.0.0',
        private: false,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '2.0.0',
      '1.0.0',
    ]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.latestVersion).toBe('2.0.0');
    expect(status.latestSatisfyingConstraint).toBeUndefined();
    expect(status.noMatchingVersion).toBe(true);
    expect(status.updateAvailable).toBe(true);
    expect(status.constraintBlocksUpdate).toBe(true);
    // Range excludes every remote tag → range_unsatisfiable per spec.
    expect(status.status).toBe('range_unsatisfiable');
  });

  it('marks non-git (local) modules as such and skips version checks', async () => {
    const project = buildProjectWithModules([
      {
        name: 'local-mod',
        location: 'file:/some/path',
        private: false,
      },
    ]);

    const listSpy = vi.spyOn(GitManager, 'listRemoteVersionTags');

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.isGitModule).toBe(false);
    expect(status.updateAvailable).toBe(false);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('reports source_unreachable when the remote query fails', async () => {
    // Spec: an unreachable remote produces a `source_unreachable` row
    // rather than a silent "no update" — so callers can distinguish
    // network failures from true up-to-date modules.
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockRejectedValue(
      new Error('network unreachable'),
    );

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.isGitModule).toBe(true);
    expect(status.updateAvailable).toBe(false);
    expect(status.availableVersions).toEqual([]);
    expect(status.status).toBe('source_unreachable');
  });

  it('reports source_unreachable when buildRemoteUrl throws on a malformed private HTTPS URL', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://',
        private: true,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    const [status] = await new CheckUpdates(project).checkUpdates(undefined, {
      username: 'u',
      token: 't',
    });

    expect(status.name).toBe('base');
    expect(status.updateAvailable).toBe(false);
    expect(status.availableVersions).toEqual([]);
    expect(status.status).toBe('source_unreachable');
  });

  it('throws when a specific module name is not in the project', async () => {
    const project = buildProjectWithModules([]);

    await expect(
      new CheckUpdates(project).checkUpdates('nonexistent'),
    ).rejects.toThrow("Module 'nonexistent' is not part of the project");
  });

  it('returns one row per declared module when multiple modules are configured', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
      {
        name: 'extension',
        location: 'https://example.com/extension.git',
        version: '^2.0.0',
        private: false,
      },
    ]);
    installModule(project, {
      name: 'base',
      version: '1.0.0',
      cardKeyPrefix: 'base',
    });
    installModule(project, {
      name: 'extension',
      version: '2.0.0',
      cardKeyPrefix: 'ext',
    });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockImplementation(
      async (remoteUrl: string) => {
        if (remoteUrl.includes('base.git')) return ['1.0.1', '1.0.0'];
        if (remoteUrl.includes('extension.git')) return ['2.1.0', '2.0.0'];
        return [];
      },
    );

    const statuses = await new CheckUpdates(project).checkUpdates();

    expect(statuses.map((s) => s.name).sort()).toEqual(['base', 'extension']);
    const base = statuses.find((s) => s.name === 'base');
    const extension = statuses.find((s) => s.name === 'extension');
    expect(base?.latestVersion).toBe('1.0.1');
    expect(extension?.latestVersion).toBe('2.1.0');
  });

  it('checks only the named module when a name is supplied', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
      {
        name: 'extension',
        location: 'https://example.com/extension.git',
        version: '^2.0.0',
        private: false,
      },
    ]);
    installModule(project, {
      name: 'base',
      version: '1.0.0',
      cardKeyPrefix: 'base',
    });
    installModule(project, {
      name: 'extension',
      version: '2.0.0',
      cardKeyPrefix: 'ext',
    });

    const listSpy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue(['1.0.1', '1.0.0']);

    const statuses = await new CheckUpdates(project).checkUpdates('base');

    expect(statuses).toHaveLength(1);
    expect(statuses[0].name).toBe('base');
    // The other module's remote must not have been queried.
    for (const call of listSpy.mock.calls) {
      expect(call[0]).not.toContain('extension.git');
    }
  });

  it('reports range_unsatisfiable when a reachable remote has zero version tags', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.availableVersions).toEqual([]);
    expect(status.latestVersion).toBeUndefined();
    expect(status.updateAvailable).toBe(false);
    expect(status.status).toBe('range_unsatisfiable');
  });

  it('treats a module with no declared version range as constraint-free', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        private: false,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '2.0.0',
      '1.0.0',
    ]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.versionConstraint).toBeUndefined();
    expect(status.latestVersion).toBe('2.0.0');
    // No range means the latest is also the latest-satisfying.
    expect(status.latestSatisfyingConstraint).toBe('2.0.0');
    expect(status.updateAvailable).toBe(true);
    expect(status.constraintBlocksUpdate).toBe(false);
    expect(status.status).toBe('update_available');
  });

  it('reports declared-but-not-installed modules with an undefined installed version', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
    ]);
    // Intentionally skip installModule — declaration with no installation on disk.

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '1.0.1',
      '1.0.0',
    ]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.installedVersion).toBeUndefined();
    expect(status.latestVersion).toBe('1.0.1');
    expect(status.updateAvailable).toBe(true);
    expect(status.status).toBe('update_available');
  });

  it('forwards credentials into the remote URL for a private HTTPS module', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/private.git',
        private: true,
      },
    ]);
    installModule(project, { name: 'base', version: '1.0.0' });

    const listSpy = vi
      .spyOn(GitManager, 'listRemoteVersionTags')
      .mockResolvedValue(['1.0.1', '1.0.0']);

    const [status] = await new CheckUpdates(project).checkUpdates(undefined, {
      username: 'alice',
      token: 'sekret',
    });

    expect(status.name).toBe('base');
    expect(status.latestVersion).toBe('1.0.1');
    // Credentials must be embedded in the URL passed to the git remote call.
    const calledUrl = listSpy.mock.calls[0]?.[0] ?? '';
    expect(calledUrl).toMatch(/alice:sekret@example\.com/);
  });

  it('reports drifted when the installed version violates the declared range', async () => {
    // Spec: a `drifted` row flags the case where someone (or a migration)
    // left an installed version behind that no longer satisfies the
    // declared range. Distinct from `update_available` — here the
    // installed version is *outside* the range, not merely below latest.
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^2.0.0',
        private: false,
      },
    ]);
    // Installed version `1.5.0` is outside `^2.0.0`.
    installModule(project, { name: 'base', version: '1.5.0' });

    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '2.1.0',
      '2.0.0',
    ]);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.installedVersion).toBe('1.5.0');
    expect(status.status).toBe('drifted');
  });
});
