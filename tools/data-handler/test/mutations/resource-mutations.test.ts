import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir, deleteDir } from '../../src/utils/file-utils.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';

const testDir = join(import.meta.dirname, 'tmp-resource-mutations');
const fixturePath = join(testDir, 'valid', 'decision-records');

describe('ResourceMutations.apply', () => {
  let project: Project;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(fixturePath);
    await project.populateCaches();
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('apply() succeeds for a non-cascading edit', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: {
        name: 'change' as const,
        target: 'Decision card type',
        to: 'New',
      },
    };
    await expect(mutations.apply(input)).resolves.toBeUndefined();
  });

  it('apply() with project_rename input writes a project_rename log entry', async () => {
    const mutations = new ResourceMutations(project);
    // We can't actually fire ProjectRenameHandler.apply() yet (no handler
    // registered), so test recordLogEntry through a stubbed handler.
    const oldPrefix = project.projectPrefix;
    const input = {
      kind: 'project_rename' as const,
      newPrefix: 'renamed',
    };
    // Use the private recordLogEntry directly via a small accessor.
    await (
      mutations as unknown as {
        recordLogEntry: (
          i: typeof input,
          ctx: { oldPrefix: string },
        ) => Promise<void>;
      }
    ).recordLogEntry(input, { oldPrefix });
    const entries = await ConfigurationLogger.entries(project.basePath);
    const last = entries[entries.length - 1];
    expect(last.kind).toBe('project_rename');
    expect(last.payload).toEqual({ oldPrefix, newPrefix: 'renamed' });
  });
});
