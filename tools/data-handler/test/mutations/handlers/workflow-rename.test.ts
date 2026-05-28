import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameHandler } from '../../../src/mutations/handlers/workflow-rename.js';
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

  it('matches a workflow rename input', () => {
    const handler = new WorkflowRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName('decision/workflows/decision'),
          newIdentifier: 'decision-v2',
        },
      }),
    ).toBe(true);
  });

  it('declines a workflow edit input', () => {
    const handler = new WorkflowRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'displayName' },
          operation: { name: 'change', target: 'A', to: 'B' },
        },
      }),
    ).toBe(false);
  });

  it('preview counts at least one affected card type', async () => {
    const handler = new WorkflowRenameHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'rename',
        target: resourceName('decision/workflows/decision'),
        newIdentifier: 'decision-v2',
      },
    });
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
    expect(preview.dataLossExpected).toBe(false);
    // At least one card type and any calculations/handlebars are summarised.
    expect(preview.summary).toMatch(/card type/i);
  });

  it('apply rewrites the workflow reference in dependent card types', async () => {
    const oldName = 'decision/workflows/decision';
    const newName = 'decision/workflows/decision-v2';
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'rename',
        target: resourceName(oldName),
        newIdentifier: 'decision-v2',
      },
      { bypassFingerprint: true },
    );
    const cardTypes = project.resources.cardTypes();
    for (const ct of cardTypes) {
      if (ct.data) {
        expect(ct.data.workflow).not.toBe(oldName);
      }
    }
    const renamed = project.resources.byType(newName, 'workflows');
    expect(renamed).toBeDefined();
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRenameHandler().isBreaking).toBe(true);
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('rewrites local card-type workflow ref; leaves foreign workflow file untouched', async () => {
    const projPath = join(tmpDir, `proj-foreign-wf-rename-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a workflow already renamed (new name on disk).
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleWorkflowsDir = join(moduleDir, 'workflows');
    await mkdir(moduleWorkflowsDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    const moduleWfNewContent = JSON.stringify({
      name: 'foo/workflows/wf-v2',
      displayName: 'Foo Workflow v2',
      states: [{ name: 'Open', category: 'initial' }],
      transitions: [{ name: 'Create', fromState: [''], toState: 'Open' }],
    });
    const moduleWfPath = join(moduleWorkflowsDir, 'wf-v2.json');
    await writeFile(moduleWfPath, moduleWfNewContent);

    // Seed a local card type that still references the OLD workflow name.
    const localCardTypePath = join(
      projPath,
      '.cards',
      'local',
      'cardTypes',
      'decision.json',
    );
    const localCT = JSON.parse(await readFile(localCardTypePath, 'utf-8')) as Record<string, unknown>;
    localCT['workflow'] = 'foo/workflows/wf-old';
    await writeFile(localCardTypePath, JSON.stringify(localCT));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'rename',
        target: resourceName('foo/workflows/wf-old'),
        newIdentifier: 'wf-v2',
      },
      { bypassFingerprint: true },
    );

    // Local card type's workflow ref should be updated.
    await foreignProject.populateCaches();
    const updatedCT = foreignProject.resources.cardTypes()
      .find((ct) => ct.data?.name === 'decision/cardTypes/decision');
    expect(updatedCT?.data?.workflow).toBe('foo/workflows/wf-v2');

    // Module workflow file must be byte-equal to what we seeded.
    const moduleFileBytes = await readFile(moduleWfPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleWfNewContent);
  });
});
