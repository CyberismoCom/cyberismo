import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowAddStateHandler } from '../../../src/mutations/handlers/workflow-add-state.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-add-state');

describe('WorkflowAddStateHandler', () => {
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

  it('matches add on workflow states', () => {
    const handler = new WorkflowAddStateHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'states' },
          operation: {
            name: 'add',
            target: { name: 'Archived', category: 'closed' },
          },
        },
      }),
    ).toBe(true);
  });

  it('is non-breaking and reports zero cascade', async () => {
    const handler = new WorkflowAddStateHandler();
    expect(handler.isBreaking).toBe(false);
    const preview = await handler.preview({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'add',
          target: { name: 'Archived', category: 'closed' },
        },
      },
    });
    expect(preview.affectedCardCount).toBe(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('apply appends the new state to the workflow definition', async () => {
    const handler = new WorkflowAddStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'add',
          target: { name: 'Archived', category: 'closed' },
        },
      },
    });
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.states.map((s) => s.name)).toContain('Archived');
  });
});
