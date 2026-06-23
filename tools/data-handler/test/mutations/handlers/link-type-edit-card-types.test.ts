import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-link-type-edit-card-types');

const LT = 'decision/linkTypes/test';

describe('linkType sourceCardTypes/destinationCardTypes edit routing and cascade', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('apply adds an existing card type to sourceCardTypes', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(LT),
      updateKey: { key: 'sourceCardTypes' },
      operation: { name: 'add', target: 'decision/cardTypes/decision' },
    });

    const lt = project.resources.byType(LT, 'linkTypes').show();
    expect(lt!.sourceCardTypes).toContain('decision/cardTypes/decision');
  });

  it('apply adds a card type that does not exist (only duplicates are rejected)', async () => {
    const mutations = new ResourceMutations(project);
    // Adding a non-existent card type is allowed; only duplicates are rejected.
    await mutations.apply({
      kind: 'edit',
      target: resourceName(LT),
      updateKey: { key: 'destinationCardTypes' },
      operation: { name: 'add', target: 'decision/cardTypes/does-not-exist' },
    });

    const lt = project.resources.byType(LT, 'linkTypes').show();
    expect(lt!.destinationCardTypes).toContain(
      'decision/cardTypes/does-not-exist',
    );
  });
});
