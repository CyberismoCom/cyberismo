import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { PlainDeleteHandler } from '../../../src/mutations/handlers/plain-handler.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
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

  it('routes a workflow delete to the plain delete handler (breaking)', () => {
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'delete',
        target: resourceName('decision/workflows/decision'),
      },
    });
    expect(handler).toBeInstanceOf(PlainDeleteHandler);
    expect(breaking).toBe(true);
  });

  // Deleting a workflow that is still used (by card types / cards) is refused.
  // WorkflowResource.delete throws when usage() is non-empty; no cascade
  // deletion of dependents takes place.
  it('refuses to delete a workflow that is still in use', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'delete',
        target: resourceName('decision/workflows/decision'),
      }),
    ).rejects.toThrow();

    // Workflow and its dependent card type are untouched.
    expect(project.resources.exists('decision/workflows/decision')).toBe(true);
    expect(project.resources.exists('decision/cardTypes/decision')).toBe(true);
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
