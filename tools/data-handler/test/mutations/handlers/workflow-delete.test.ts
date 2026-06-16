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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-delete');

const WF = 'decision/workflows/decision';
const DEPENDENT_CT = 'decision/cardTypes/decision';

describe('WorkflowDeleteHandler', () => {
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

  it('deletes an unused workflow', async () => {
    const unusedName = 'decision/workflows/unused';
    await project.resources.byType(unusedName, 'workflows').create();
    await project.populateCaches();
    expect(project.resources.exists(unusedName)).toBe(true);

    await new ResourceMutations(project).apply({
      kind: 'delete',
      target: resourceName(unusedName),
    });
    await project.populateCaches();
    expect(project.resources.exists(unusedName)).toBe(false);
  });

  it('cascade-deletes dependent card types when deleting an in-use workflow', async () => {
    expect(project.resources.exists(DEPENDENT_CT)).toBe(true);

    await new ResourceMutations(project).apply({
      kind: 'delete',
      target: resourceName(WF),
    });
    await project.populateCaches();

    expect(project.resources.exists(WF)).toBe(false);
    expect(project.resources.exists(DEPENDENT_CT)).toBe(false);
  });

  it('deletes the cards of the dependent card types', async () => {
    const before = project
      .cards(undefined)
      .filter((c) => c.metadata?.cardType === DEPENDENT_CT);
    expect(before.length).toBeGreaterThan(0);

    await new ResourceMutations(project).apply({
      kind: 'delete',
      target: resourceName(WF),
    });
    await project.populateCaches();

    const after = project
      .cards(undefined)
      .filter((c) => c.metadata?.cardType === DEPENDENT_CT);
    expect(after).toHaveLength(0);
  });

  it('rejects deleting a module-owned workflow', async () => {
    await expect(
      new ResourceMutations(project).apply({
        kind: 'delete',
        target: resourceName('mymod/workflows/dummy'),
      }),
    ).rejects.toThrow(
      'Cannot delete resource mymod/workflows/dummy: It is a module resource',
    );
  });

  it('throws when the workflow does not exist', async () => {
    await expect(
      new ResourceMutations(project).apply({
        kind: 'delete',
        target: resourceName('decision/workflows/does-not-exist'),
      }),
    ).rejects.toThrow();
  });
});
