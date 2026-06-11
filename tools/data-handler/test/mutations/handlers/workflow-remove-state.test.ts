import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRemoveStateHandler } from '../../../src/mutations/handlers/workflow-remove-state.js';
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
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
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

  it('matches remove on workflow states', () => {
    expect(
      new WorkflowRemoveStateHandler().matches({
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
      }),
    ).toBe(true);
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRemoveStateHandler().isBreaking).toBe(true);
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

  it('apply without replacementValue migrates cards to the new-card state', async () => {
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

    // Without a recorded replacement, cards fall back to the state a new
    // card would get: the toState of the fixture's 'Create' transition.
    const refetched = project.cards(undefined).find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Draft');
  });

  it('applyCascade without an initial transition leaves cards in the removed state', async () => {
    const cardKey = await seedCardInState('Rejected');

    // Resource validation requires exactly one new-card transition, so this
    // workflow shape can only be constructed on disk (mirroring a replay
    // chain where later mutations rewrote the workflow).
    const wfPath = join(
      projectPath,
      '.cards',
      'local',
      'workflows',
      'decision.json',
    );
    const wf = JSON.parse(await readFile(wfPath, 'utf-8'));
    wf.transitions = wf.transitions.filter(
      (t: { fromState: string[] }) => !t.fromState.includes(''),
    );
    await writeFile(wfPath, JSON.stringify(wf));
    project = new Project(projectPath);
    await project.populateCaches();

    await new WorkflowRemoveStateHandler().applyCascade({
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

    const refetched = project.cards(undefined).find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Rejected');
  });

  it('applyCascade tolerates a missing workflow (no migration, no throw)', async () => {
    const cardKey = await seedCardInState('Rejected');

    await new WorkflowRemoveStateHandler().applyCascade({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/nonexistent'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
        },
      },
    });

    const refetched = project.cards(undefined).find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Rejected');
  });
});
