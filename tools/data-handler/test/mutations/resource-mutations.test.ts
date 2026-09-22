import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir, deleteDir } from '../../src/utils/file-utils.js';

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
});
