import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ModuleUpdater } from '../../../src/mutations/module-update/plan.js';
import { copyDir } from '../../../src/utils/file-utils.js';

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
    await seedInstalledModule(projectPath, 'shared/foo', ['1.0.0']);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate([
      { prefix: 'shared/foo', fromVersion: '1.0.0', toVersion: '1.0.0' },
    ]);
    expect(preview.steps).toHaveLength(0);
    expect(preview.conflicts).toHaveLength(0);
  });

  it('returns steps with logChain populated for a real upgrade', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', [
      '1.0.0',
      '1.1.0',
      '1.2.0',
    ]);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate([
      { prefix: 'shared/foo', fromVersion: '1.0.0', toVersion: '1.2.0' },
    ]);
    expect(preview.steps.length).toBe(1);
    expect(preview.steps[0].modulePrefix).toBe('shared/foo');
    expect(preview.steps[0].toVersion).toBe('1.2.0');
    expect(preview.steps[0].fromVersion).toBe('1.0.0');
    expect(preview.steps[0].logChain).toEqual(['1.1.0', '1.2.0']);
    expect(preview.steps[0].crossesMajorBoundary).toBe(false);
    expect(preview.conflicts).toHaveLength(0);
  });

  it('emits one step per request, with sequential order', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', ['1.0.0', '1.1.0']);
    await seedInstalledModule(projectPath, 'shared/bar', ['2.0.0', '2.1.0']);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate([
      { prefix: 'shared/foo', fromVersion: '1.0.0', toVersion: '1.1.0' },
      { prefix: 'shared/bar', fromVersion: '2.0.0', toVersion: '2.1.0' },
    ]);
    expect(preview.steps).toHaveLength(2);
    expect(preview.steps[0]).toMatchObject({
      order: 1,
      modulePrefix: 'shared/foo',
    });
    expect(preview.steps[1]).toMatchObject({
      order: 2,
      modulePrefix: 'shared/bar',
    });
  });

  it('skips requests where fromVersion === toVersion', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', ['1.0.0', '1.1.0']);
    await seedInstalledModule(projectPath, 'shared/bar', ['2.0.0']);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate([
      { prefix: 'shared/foo', fromVersion: '1.0.0', toVersion: '1.1.0' },
      { prefix: 'shared/bar', fromVersion: '2.0.0', toVersion: '2.0.0' },
    ]);
    expect(preview.steps).toHaveLength(1);
    expect(preview.steps[0].modulePrefix).toBe('shared/foo');
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

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate([
      { prefix: 'shared/foo', fromVersion: '1.0.0', toVersion: '1.2.0' },
    ]);
    expect(preview.conflicts).toHaveLength(0);

    const result = await updater.applyUpdate(preview);
    expect(result.status).toBe('succeeded');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].toVersion).toBe('1.2.0');
  });

  it('refuses to apply when conflicts present', async () => {
    // From 1.6.0 (top of major 1) to 2.0.0 with no higher 1.x sealed log
    // → diverged branch → migration_path_unreachable conflict.
    await seedInstalledModule(projectPath, 'shared/foo', [
      '1.5.0',
      '1.6.0',
      '2.0.0',
    ]);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate([
      { prefix: 'shared/foo', fromVersion: '1.6.0', toVersion: '2.0.0' },
    ]);
    expect(preview.conflicts.length).toBeGreaterThan(0);
    await expect(updater.applyUpdate(preview)).rejects.toThrow(/conflict/i);
  });

  it('applies a transitive batch in input order', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', ['1.0.0', '1.1.0']);
    await seedInstalledModule(projectPath, 'shared/bar', ['2.0.0', '2.1.0']);

    const updater = new ModuleUpdater(project);
    const preview = await updater.previewUpdate([
      { prefix: 'shared/foo', fromVersion: '1.0.0', toVersion: '1.1.0' },
      { prefix: 'shared/bar', fromVersion: '2.0.0', toVersion: '2.1.0' },
    ]);

    const result = await updater.applyUpdate(preview);
    expect(result.status).toBe('succeeded');
    expect(result.steps.map((s) => s.modulePrefix)).toEqual([
      'shared/foo',
      'shared/bar',
    ]);
  });
});
