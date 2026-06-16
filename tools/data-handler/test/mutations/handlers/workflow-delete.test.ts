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

describe('workflow delete routing and cascade', () => {
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

  // Deleting a workflow that is still used (by card types / cards) is refused.
  // Deleting an in-use workflow cascade-deletes every card type that
  // references it (which in turn deletes those card types' cards).
  it('cascade-deletes dependent card types when deleting an in-use workflow', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'delete',
      target: resourceName('decision/workflows/decision'),
    });
    await project.populateCaches();

    // The workflow and its dependent card type are both gone.
    expect(project.resources.exists('decision/workflows/decision')).toBe(false);
    expect(project.resources.exists('decision/cardTypes/decision')).toBe(false);
    // No card of the deleted card type remains.
    const anyDecisionCard = project
      .cards(undefined)
      .some((c) => c.metadata?.cardType === 'decision/cardTypes/decision');
    expect(anyDecisionCard).toBe(false);
  });

  it('deletes an unused workflow', async () => {
    // Create a fresh workflow that no card type references, so usage() is empty
    // and the delete is allowed.
    const unusedName = 'decision/workflows/unused';
    const wf = project.resources.byType(unusedName, 'workflows');
    await wf.create();
    await project.populateCaches();
    expect(project.resources.exists(unusedName)).toBe(true);

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'delete',
      target: resourceName(unusedName),
    });
    await project.populateCaches();
    expect(project.resources.exists(unusedName)).toBe(false);
  });

  it('throws when the workflow does not exist', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'delete',
        target: resourceName('decision/workflows/does-not-exist'),
      }),
    ).rejects.toThrow();
  });
});
