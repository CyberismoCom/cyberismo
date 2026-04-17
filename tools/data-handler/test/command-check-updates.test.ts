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

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { CheckUpdates } from '../src/commands/check-updates.js';
import { ModuleManager } from '../src/module-manager.js';
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

    vi.spyOn(ModuleManager.prototype, 'readModuleVersion').mockResolvedValue(
      '1.0.0',
    );
    vi.spyOn(
      ModuleManager.prototype,
      'listAvailableVersions',
    ).mockResolvedValue(['1.0.1', '1.0.0']);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.name).toBe('base');
    expect(status.installedVersion).toBe('1.0.0');
    expect(status.latestVersion).toBe('1.0.1');
    expect(status.latestSatisfyingConstraint).toBe('1.0.1');
    expect(status.updateAvailable).toBe(true);
    expect(status.constraintBlocksUpdate).toBeFalsy();
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

    vi.spyOn(ModuleManager.prototype, 'readModuleVersion').mockResolvedValue(
      '1.0.0',
    );
    vi.spyOn(
      ModuleManager.prototype,
      'listAvailableVersions',
    ).mockResolvedValue(['1.0.1', '1.0.0']);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.latestVersion).toBe('1.0.1');
    expect(status.latestSatisfyingConstraint).toBe('1.0.0');
    expect(status.updateAvailable).toBe(true);
    expect(status.constraintBlocksUpdate).toBe(true);
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

    vi.spyOn(ModuleManager.prototype, 'readModuleVersion').mockResolvedValue(
      '1.0.1',
    );
    vi.spyOn(
      ModuleManager.prototype,
      'listAvailableVersions',
    ).mockResolvedValue(['1.0.1', '1.0.0']);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.installedVersion).toBe('1.0.1');
    expect(status.latestVersion).toBe('1.0.1');
    expect(status.updateAvailable).toBe(false);
    expect(status.constraintBlocksUpdate).toBeFalsy();
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

    vi.spyOn(ModuleManager.prototype, 'readModuleVersion').mockResolvedValue(
      '1.0.0',
    );
    vi.spyOn(
      ModuleManager.prototype,
      'listAvailableVersions',
    ).mockResolvedValue(['2.0.0', '1.0.0']);

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.latestVersion).toBe('2.0.0');
    expect(status.latestSatisfyingConstraint).toBeUndefined();
    expect(status.noMatchingVersion).toBe(true);
    expect(status.updateAvailable).toBe(true);
    expect(status.constraintBlocksUpdate).toBe(true);
  });

  it('marks non-git (local) modules as such and skips version checks', async () => {
    const project = buildProjectWithModules([
      {
        name: 'local-mod',
        location: 'file:/some/path',
        private: false,
      },
    ]);

    vi.spyOn(ModuleManager.prototype, 'readModuleVersion').mockResolvedValue(
      undefined,
    );
    const listSpy = vi.spyOn(
      ModuleManager.prototype,
      'listAvailableVersions',
    );

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.isGitModule).toBe(false);
    expect(status.updateAvailable).toBe(false);
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('falls back gracefully when listAvailableVersions throws', async () => {
    const project = buildProjectWithModules([
      {
        name: 'base',
        location: 'https://example.com/base.git',
        version: '^1.0.0',
        private: false,
      },
    ]);

    vi.spyOn(ModuleManager.prototype, 'readModuleVersion').mockResolvedValue(
      '1.0.0',
    );
    vi.spyOn(
      ModuleManager.prototype,
      'listAvailableVersions',
    ).mockRejectedValue(new Error('network unreachable'));

    const [status] = await new CheckUpdates(project).checkUpdates();

    expect(status.isGitModule).toBe(true);
    expect(status.updateAvailable).toBe(false);
    expect(status.availableVersions).toEqual([]);
  });

  it('throws when a specific module name is not in the project', async () => {
    const project = buildProjectWithModules([]);

    await expect(
      new CheckUpdates(project).checkUpdates('nonexistent'),
    ).rejects.toThrow("Module 'nonexistent' is not part of the project");
  });
});
