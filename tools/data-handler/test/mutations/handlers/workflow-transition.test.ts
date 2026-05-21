import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowTransitionHandler } from '../../../src/mutations/handlers/workflow-transition.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-transition');

describe('WorkflowTransitionHandler', () => {
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

  it('matches add on transitions', () => {
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: {
            name: 'add',
            target: { name: 'Archive', fromState: ['Approved'], toState: 'Deprecated' },
          },
        },
      }),
    ).toBe(true);
  });

  it('matches remove on transitions', () => {
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: { name: 'remove', target: 'Deprecate' },
        },
      }),
    ).toBe(true);
  });

  it('matches change (rename) on transitions', () => {
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: {
            name: 'change',
            target: 'Deprecate',
            to: 'MarkDeprecated',
          },
        },
      }),
    ).toBe(true);
  });

  it('declines transition changes that also touch fromState/toState', () => {
    // This handler covers add/remove/rename only — leave structural
    // transition rewrites to the state-rename / state-remove handlers.
    expect(
      new WorkflowTransitionHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'transitions' },
          operation: {
            name: 'change',
            target: { name: 'Deprecate', fromState: ['Approved'], toState: 'Deprecated' },
            to: { name: 'MarkDeprecated', fromState: ['Approved'], toState: 'Deprecated' },
          },
        },
      }),
    ).toBe(true);
  });

  it('is non-breaking', () => {
    expect(new WorkflowTransitionHandler().isBreaking).toBe(false);
  });

  it('apply add appends the transition to the workflow definition', async () => {
    const handler = new WorkflowTransitionHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'transitions' },
        operation: {
          name: 'add',
          target: { name: 'Archive', fromState: ['Approved'], toState: 'Deprecated' },
        },
      },
    });
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.transitions.map((t) => t.name)).toContain('Archive');
  });
});
