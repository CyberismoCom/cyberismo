import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
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
    // Seed an attachment whose file name carries the project prefix so the
    // attachment-rename step of the cascade has something to assert on.
    await writeFile(
      join(projectPath, 'cardRoot', 'decision_5', 'a', 'decision_diagram.png'),
      'fake-image',
    );
    project = new Project(projectPath);
    await project.populateCaches();
    originalPrefix = project.projectPrefix;
  });
  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('apply renames the prefix and logs a single project_rename entry', async () => {
    const mutations = new ResourceMutations(project);

    await mutations.apply({ kind: 'project_rename', newPrefix: 'renamed' });

    expect(project.projectPrefix).toBe('renamed');

    // Exactly one project_rename entry is recorded per rename.
    const entries = await ConfigurationLogger.entries(project.basePath);
    const projectRenameEntries = entries.filter(
      (e) => e.kind === 'project_rename',
    );
    expect(projectRenameEntries).toHaveLength(1);
    expect(projectRenameEntries[0].target).toBe('renamed');
    expect(projectRenameEntries[0].payload).toEqual({
      oldPrefix: originalPrefix,
      newPrefix: 'renamed',
    });

    // Attachment files carrying the old prefix are renamed along with the
    // card directory that contains them.
    const attachmentDir = join(projectPath, 'cardRoot', 'renamed_5', 'a');
    expect(existsSync(join(attachmentDir, 'renamed_diagram.png'))).toBe(true);
    expect(existsSync(join(attachmentDir, 'decision_diagram.png'))).toBe(false);
  });
});
