import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameStateHandler } from '../../../src/mutations/handlers/workflow-rename-state.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename-state');

const WF = 'decision/workflows/decision';

describe('WorkflowRenameStateHandler', () => {
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

  it('matches a state rename (name identity change)', () => {
    expect(
      new WorkflowRenameStateHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(WF),
          updateKey: { key: 'states' },
          operation: {
            name: 'change',
            target: { name: 'Draft', category: 'initial' },
            to: { name: 'DraftNew', category: 'initial' },
          },
        },
      }),
    ).toBe(true);
  });

  it('declines a change that keeps the same state name (non-identity change)', () => {
    // A category-only change is not a state rename; it falls through to the
    // default handler instead.
    expect(
      new WorkflowRenameStateHandler().matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(WF),
          updateKey: { key: 'states' },
          operation: {
            name: 'change',
            target: { name: 'Draft', category: 'initial' },
            to: { name: 'Draft', category: 'active' },
          },
        },
      }),
    ).toBe(false);
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRenameStateHandler().isBreaking).toBe(true);
  });

  it('apply rewrites workflowState on affected cards and transitions', async () => {
    // Place a card in 'Draft'.
    const target = project
      .cards(undefined)
      .find((c) => c.metadata?.cardType === 'decision/cardTypes/decision')!;
    target.metadata!.workflowState = 'Draft';
    await project.updateCardMetadata(target, target.metadata!);

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'change',
        target: { name: 'Draft', category: 'initial' },
        to: { name: 'DraftNew', category: 'initial' },
      },
    });

    const refetched = project
      .cards(undefined)
      .find((c) => c.key === target.key)!;
    expect(refetched.metadata?.workflowState).toBe('DraftNew');

    const wf = project.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).toContain('DraftNew');
    expect(wf.data!.states.map((s) => s.name)).not.toContain('Draft');
    for (const t of wf.data!.transitions) {
      expect(t.toState).not.toBe('Draft');
      expect(t.fromState).not.toContain('Draft');
    }
  });
});
