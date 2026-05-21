// tools/data-handler/test/mutations/integration-project-rename.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { copyDir } from '../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-integration-project-rename');

describe('ProjectRename end-to-end', () => {
  let project: Project;
  let projectPath: string;
  let originalPrefix: string;

  beforeAll(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
    originalPrefix = project.projectPrefix;
  });
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('plan → apply → log entry', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'project_rename' as const,
      newPrefix: 'renamed',
    };
    const plan = await mutations.plan(input);
    expect(plan.isBreaking).toBe(true);
    expect(plan.preview.affectedCardCount).toBeGreaterThan(0);

    await mutations.apply(input, { fingerprint: plan.fingerprint });

    expect(project.projectPrefix).toBe('renamed');

    const entries = await ConfigurationLogger.entries(project.basePath);
    const projectRenameEntries = entries.filter(
      (e) => e.kind === 'project_rename',
    );
    expect(projectRenameEntries).toHaveLength(1);
    expect(projectRenameEntries[0].payload).toEqual({
      oldPrefix: originalPrefix,
      newPrefix: 'renamed',
    });
  });
});
