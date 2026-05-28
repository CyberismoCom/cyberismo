import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowAddStateHandler } from '../../../src/mutations/handlers/workflow-add-state.js';
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
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'add',
          target: { name: 'Archived', category: 'closed' },
        },
      },
      { bypassFingerprint: true },
    );
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.states.map((s) => s.name)).toContain('Archived');
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('does nothing for consumers (no cascade); leaves foreign workflow file untouched', async () => {
    const projPath = join(tmpDir, `proj-foreign-wf-add-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a workflow that already has the state added.
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
      states: [
        { name: 'Open', category: 'initial' },
        { name: 'Archived', category: 'closed' },
      ],
      transitions: [{ name: 'Create', fromState: [''], toState: 'Open' }],
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
        updateKey: { key: 'states' },
        operation: {
          name: 'add',
          target: { name: 'Archived', category: 'closed' },
        },
      },
      { bypassFingerprint: true },
    );

    // Module workflow file must be byte-equal to what we seeded.
    const moduleFileBytes = await readFile(moduleWfPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleWfContent);
  });
});
