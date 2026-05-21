import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ModuleUpdater } from '../../../src/mutations/module-update/plan.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { writeAppliedModules } from '../../../src/mutations/module-update/applied-modules.js';

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
