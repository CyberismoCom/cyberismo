import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowTransitionHandler } from '../../../src/mutations/handlers/workflow-transition.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

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
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'transitions' },
        operation: {
          name: 'add',
          target: { name: 'Archive', fromState: ['Approved'], toState: 'Deprecated' },
        },
      },
      { bypassFingerprint: true },
    );
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.transitions.map((t) => t.name)).toContain('Archive');
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('does not modify local consumers; leaves foreign workflow file untouched', async () => {
    const projPath = join(tmpDir, `proj-foreign-wf-tr-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a workflow that already has the transition added.
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleWorkflowsDir = join(moduleDir, 'workflows');
    await mkdir(moduleWorkflowsDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    const moduleWfContent = JSON.stringify({
      name: 'foo/workflows/wf',
      displayName: 'Foo Workflow',
      states: [{ name: 'Open', category: 'initial' }],
      transitions: [
        { name: 'Create', fromState: [''], toState: 'Open' },
        { name: 'Archive', fromState: ['Open'], toState: 'Open' },
      ],
    });
    const moduleWfPath = join(moduleWorkflowsDir, 'wf.json');
    await writeFile(moduleWfPath, moduleWfContent);

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('foo/workflows/wf'),
        updateKey: { key: 'transitions' },
        operation: {
          name: 'add',
          target: { name: 'Archive', fromState: ['Open'], toState: 'Open' },
        },
      },
      { bypassFingerprint: true },
    );

    // Module workflow file must be byte-equal to what we seeded.
    const moduleFileBytes = await readFile(moduleWfPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleWfContent);
  });
});
