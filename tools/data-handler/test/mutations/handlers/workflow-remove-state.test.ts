import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRemoveStateHandler } from '../../../src/mutations/handlers/workflow-remove-state.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-remove-state');

const WF = 'decision/workflows/decision';

describe('WorkflowRemoveStateHandler', () => {
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

  // Helper: put the first decision card into the given state.
  async function seedCardInState(state: string) {
    const target = project
      .cards(undefined)
      .find((c) => c.metadata?.cardType === 'decision/cardTypes/decision')!;
    target.metadata!.workflowState = state;
    await project.updateCardMetadata(target, target.metadata!);
    return target.key;
  }

  it('routes remove on workflow states to this handler (breaking)', () => {
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'edit',
        target: resourceName(WF),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
        },
      },
    });
    expect(handler).toBeInstanceOf(WorkflowRemoveStateHandler);
    expect(breaking).toBe(true);
  });

  it('apply removes the state and strips transitions referencing it', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'remove',
        target: { name: 'Rejected', category: 'closed' },
      },
    });
    const wf = project.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).not.toContain('Rejected');
    for (const t of wf.data!.transitions) {
      expect(t.toState).not.toBe('Rejected');
      expect(t.fromState).not.toContain('Rejected');
    }
  });

  it('apply with explicit replacementValue migrates cards to that state', async () => {
    const cardKey = await seedCardInState('Rejected');

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'remove',
        target: { name: 'Rejected', category: 'closed' },
        replacementValue: { name: 'Approved', category: 'closed' },
      },
    });

    const refetched = project.cards(undefined).find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Approved');
  });

  it('apply without replacementValue does NOT migrate cards', async () => {
    const cardKey = await seedCardInState('Rejected');

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'remove',
        target: { name: 'Rejected', category: 'closed' },
      },
    });

    // Cards are only migrated when a replacementValue is given; without one,
    // the card keeps its (now-removed) state value.
    const refetched = project.cards(undefined).find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Rejected');
  });
});
