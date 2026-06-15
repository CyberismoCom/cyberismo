import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameHandler } from '../../../src/mutations/handlers/workflow-rename.js';
import { PlainHandler } from '../../../src/mutations/handlers/plain-handler.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename');

describe('WorkflowRenameHandler', () => {
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

  it('routes a workflow rename input to this handler (breaking)', () => {
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'rename',
        target: resourceName('decision/workflows/decision'),
        newIdentifier: 'decision-v2',
      },
    });
    expect(handler).toBeInstanceOf(WorkflowRenameHandler);
    expect(breaking).toBe(true);
  });

  it('routes a workflow edit input to the plain handler, not this one', () => {
    const { handler } = dispatch({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'displayName' },
        operation: { name: 'change', target: 'A', to: 'B' },
      },
    });
    expect(handler).not.toBeInstanceOf(WorkflowRenameHandler);
    expect(handler).toBeInstanceOf(PlainHandler);
  });

  it('apply rewrites the workflow reference in dependent card types', async () => {
    const oldName = 'decision/workflows/decision';
    const newName = 'decision/workflows/decision-v2';
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(oldName),
      newIdentifier: 'decision-v2',
    });

    // No card type still references the old workflow name; the card type that
    // used 'decision' now references the new name.
    for (const ct of project.resources.cardTypes()) {
      if (ct.data) {
        expect(ct.data.workflow).not.toBe(oldName);
      }
    }
    const decisionCt = project.resources
      .byType('decision/cardTypes/decision', 'cardTypes')
      .show();
    expect(decisionCt!.workflow).toBe(newName);

    // The workflow file itself has the new name.
    const renamed = project.resources.byType(newName, 'workflows').show();
    expect(renamed!.name).toBe(newName);
  });

  it('throws when the workflow does not exist', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'rename',
        target: resourceName('decision/workflows/does-not-exist'),
        newIdentifier: 'whatever',
      }),
    ).rejects.toThrow();
  });
});
