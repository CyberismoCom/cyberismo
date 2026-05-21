import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ModuleUpdate } from '../../../src/commands/module-update.js';
import { ModuleUpdater } from '../../../src/mutations/module-update/plan.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import {
  readAppliedModules,
  writeAppliedModules,
} from '../../../src/mutations/module-update/applied-modules.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'minimal',
);
const tmpDir = join(import.meta.dirname, 'tmp-updater');

/**
 * Seed an installed module under .cards/modules/<prefix>/migrations with
 * one empty sealed log per version. Returns the module folder path.
 */
async function seedInstalledModule(
  projectPath: string,
  modulePrefix: string,
  sealedVersions: string[],
): Promise<string> {
  const moduleFolder = join(
    projectPath,
    '.cards',
    'modules',
    modulePrefix,
    'migrations',
  );
  await mkdir(moduleFolder, { recursive: true });
  for (const v of sealedVersions) {
    await writeFile(join(moduleFolder, `migrationLog_${v}.jsonl`), '');
  }
  return moduleFolder;
}

describe('ModuleUpdater.previewUpdate', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty preview when the module is up to date', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', [
      '1.0.0',
    ]);
    await writeAppliedModules(projectPath, [
      {
        prefix: 'shared/foo',
        installedVersion: '1.0.0',
        appliedVersion: '1.0.0',
      },
    ]);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate('shared/foo', '1.0.0');
    expect(preview.steps).toHaveLength(0);
    expect(preview.conflicts).toHaveLength(0);
  });

  it('returns steps with logChain populated for a real upgrade', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', [
      '1.0.0',
      '1.1.0',
      '1.2.0',
    ]);
    await writeAppliedModules(projectPath, [
      {
        prefix: 'shared/foo',
        installedVersion: '1.0.0',
        appliedVersion: '1.0.0',
      },
    ]);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate('shared/foo', '1.2.0');
    expect(preview.steps.length).toBe(1);
    expect(preview.steps[0].modulePrefix).toBe('shared/foo');
    expect(preview.steps[0].toVersion).toBe('1.2.0');
    expect(preview.steps[0].fromVersion).toBe('1.0.0');
    expect(preview.steps[0].logChain).toEqual(['1.1.0', '1.2.0']);
    expect(preview.steps[0].crossesMajorBoundary).toBe(false);
    expect(preview.conflicts).toHaveLength(0);
  });
});

describe('ModuleUpdater.applyUpdate', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('applies a real upgrade end-to-end', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', [
      '1.0.0',
      '1.1.0',
      '1.2.0',
    ]);
    await writeAppliedModules(projectPath, [
      {
        prefix: 'shared/foo',
        installedVersion: '1.0.0',
        appliedVersion: '1.0.0',
      },
    ]);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate('shared/foo', '1.2.0');
    expect(preview.conflicts).toHaveLength(0);

    const result = await updater.applyUpdate(preview);
    expect(result.status).toBe('succeeded');

    // Verify appliedModules was updated.
    const applied = await readAppliedModules(project.basePath);
    expect(
      applied.find((m) => m.prefix === 'shared/foo')?.appliedVersion,
    ).toBe('1.2.0');
  });

  it('refuses to apply when conflicts present', async () => {
    // From 1.6.0 (top of major 1) to 2.0.0 with no higher 1.x sealed log
    // → diverged branch → migration_path_unreachable conflict.
    await seedInstalledModule(projectPath, 'shared/foo', [
      '1.5.0',
      '1.6.0',
      '2.0.0',
    ]);
    await writeAppliedModules(projectPath, [
      {
        prefix: 'shared/foo',
        installedVersion: '1.6.0',
        appliedVersion: '1.6.0',
      },
    ]);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate('shared/foo', '2.0.0');
    expect(preview.conflicts.length).toBeGreaterThan(0);
    await expect(updater.applyUpdate(preview)).rejects.toThrow(/conflict/i);
  });
});

describe('ModuleUpdate end-to-end', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Seed an installed module `foo` with an empty sealed migration log at the
   * target version. Then declare `foo` in the host project's cardsConfig.json
   * so Project picks it up.
   *
   * Note: the consumer's existing `ResourceObject` guards refuse to mutate
   * module-owned resources, so this test exercises the no-op replay path
   * (empty log lines). The bookkeeping side (preview steps, conflict
   * detection, appliedModules.json bump) is what matters end-to-end here.
   * A future task will need to add a "replay mode" affordance to relax that
   * guard for foreign-prefix log entries.
   */
  async function seedFooModuleAndDeclare(opts: {
    fromVersion: string;
    toVersion: string;
  }): Promise<void> {
    const moduleRoot = join(projectPath, '.cards', 'modules', 'foo');
    await mkdir(join(moduleRoot, 'migrations'), { recursive: true });
    await writeFile(
      join(moduleRoot, 'cardsConfig.json'),
      JSON.stringify(
        {
          schemaVersion: 4,
          cardKeyPrefix: 'foo',
          name: 'foo',
          modules: [],
          hubs: [],
          version: opts.toVersion,
        },
        null,
        2,
      ),
    );

    // Empty sealed log: replay treats it as a no-op success.
    await writeFile(
      join(moduleRoot, 'migrations', `migrationLog_${opts.toVersion}.jsonl`),
      '',
    );

    // Declare the module in the consuming project's cardsConfig.json.
    const hostConfigPath = join(
      projectPath,
      '.cards',
      'local',
      'cardsConfig.json',
    );
    const { readFile } = await import('node:fs/promises');
    const hostConfig = JSON.parse(await readFile(hostConfigPath, 'utf-8'));
    hostConfig.modules = [{ name: 'foo', version: `^${opts.toVersion}` }];
    await writeFile(hostConfigPath, JSON.stringify(hostConfig, null, 4));

    // Record the applied version (the from side).
    await writeAppliedModules(projectPath, [
      {
        prefix: 'foo',
        installedVersion: opts.toVersion,
        appliedVersion: opts.fromVersion,
      },
    ]);
  }

  it('end-to-end: previews and applies a noop-log update, bumps appliedModules', async () => {
    await seedFooModuleAndDeclare({ fromVersion: '1.0.0', toVersion: '1.6.0' });

    // Open project after seeding so the module is discovered.
    project = new Project(projectPath);
    await project.populateCaches();

    const initialApplied = await readAppliedModules(projectPath);
    expect(initialApplied[0].appliedVersion).toBe('1.0.0');

    const moduleUpdate = new ModuleUpdate(project);
    const preview = await moduleUpdate.preview('foo', '1.6.0');
    expect(preview.steps).toHaveLength(1);
    expect(preview.steps[0].logChain).toEqual(['1.6.0']);
    expect(preview.conflicts).toHaveLength(0);

    const result = await moduleUpdate.apply(preview);
    expect(
      result.status,
      `apply failure: ${JSON.stringify(result, null, 2)}`,
    ).toBe('succeeded');

    // appliedModules.json bumped to the new version.
    const finalApplied = await readAppliedModules(projectPath);
    expect(finalApplied.find((m) => m.prefix === 'foo')?.appliedVersion).toBe(
      '1.6.0',
    );

    // Sealed log is still present on disk (replay is read-only).
    const logPath = join(
      projectPath,
      '.cards',
      'modules',
      'foo',
      'migrations',
      'migrationLog_1.6.0.jsonl',
    );
    await expect(stat(logPath)).resolves.not.toThrow();
  });

  it('end-to-end: refuses to apply when conflicts present', async () => {
    // Same module skeleton, but applied version sits at the tip of a major
    // (1.6.0) with no higher 1.x available — diverged-branch conflict when
    // we try to cross to 2.0.0.
    const moduleRoot = join(projectPath, '.cards', 'modules', 'foo');
    await mkdir(join(moduleRoot, 'migrations'), { recursive: true });
    for (const v of ['1.5.0', '1.6.0', '2.0.0']) {
      await writeFile(
        join(moduleRoot, 'migrations', `migrationLog_${v}.jsonl`),
        '',
      );
    }
    await writeAppliedModules(projectPath, [
      {
        prefix: 'foo',
        installedVersion: '1.6.0',
        appliedVersion: '1.6.0',
      },
    ]);

    project = new Project(projectPath);
    await project.populateCaches();

    const moduleUpdate = new ModuleUpdate(project);
    const preview = await moduleUpdate.preview('foo', '2.0.0');
    expect(preview.conflicts.length).toBeGreaterThan(0);
    await expect(moduleUpdate.apply(preview)).rejects.toThrow(/conflict/i);
  });
});
