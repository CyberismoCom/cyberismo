import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../src/infra/checkout.js';
import { resourceName } from '../../../src/shared/utils/resource-utils.js';
import { copyDir } from '../../../src/shared/utils/file-utils.js';
import { ResourceMutations } from '../../../src/domain/mutations/resource-mutations.js';
import { Workspace } from '../../../src/api/workspace/workspace.js';
import {
  SYSTEM_ACTOR,
  SYSTEM_FRAME,
} from '../../../src/shared/utils/tx-record.js';
import { updateCardMetadata } from '../../../src/domain/cards/update.js';

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
  let checkout: Checkout;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    checkout = new Checkout(projectPath);
    await checkout.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // Helper: put the first decision card into the given state.
  async function seedCardInState(state: string) {
    const target = checkout.cardTree
      .cards()
      .find((c) => c.metadata?.cardType === 'decision/cardTypes/decision')!;
    target.metadata!.workflowState = state;
    await updateCardMetadata(checkout, target, target.metadata!);
    return target.key;
  }

  it('apply removes the state and strips transitions referencing it', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'remove',
        target: { name: 'Rejected', category: 'closed' },
      },
    });
    const wf = checkout.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).not.toContain('Rejected');
    for (const t of wf.data!.transitions) {
      expect(t.toState).not.toBe('Rejected');
      expect(t.fromState).not.toContain('Rejected');
    }
  });

  it('apply with explicit replacementValue migrates cards to that state', async () => {
    const cardKey = await seedCardInState('Rejected');
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'remove',
        target: { name: 'Rejected', category: 'closed' },
        replacementValue: { name: 'Approved', category: 'closed' },
      },
    });

    const refetched = checkout.cardTree.cards().find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Approved');
  });

  it('replay migrates a card whose card type is renamed later in the chain', async () => {
    // The card still carries its pre-rename type while this (earlier) seal
    // replays; the registry already shows the new name. The rename map must
    // bridge the two or the card is missed.
    const target = checkout.cardTree
      .cards()
      .find((c) => c.metadata?.cardType === 'decision/cardTypes/decision')!;
    target.metadata!.cardType = 'decision/cardTypes/oldDecision';
    target.metadata!.workflowState = 'Rejected';
    await updateCardMetadata(checkout, target, target.metadata!);

    await checkout.lock.write(SYSTEM_FRAME, () =>
      new ResourceMutations(checkout).apply(
        {
          kind: 'edit',
          target: resourceName(WF),
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: { name: 'Rejected', category: 'closed' },
            replacementValue: { name: 'Approved', category: 'closed' },
          },
        },
        {
          kind: 'replay',
          modulePrefix: checkout.projectPrefix,
          cardTypeRenames: new Map([
            ['decision/cardTypes/oldDecision', 'decision/cardTypes/decision'],
          ]),
        },
      ),
    );

    const refetched = checkout.cardTree
      .cards()
      .find((c) => c.key === target.key)!;
    expect(refetched.metadata?.workflowState).toBe('Approved');
  });

  it('applyCascade tolerates a bare-string replacementValue (replay shape)', async () => {
    const cardKey = await seedCardInState('Rejected');

    await checkout.lock.write(SYSTEM_FRAME, () =>
      new ResourceMutations(checkout).apply(
        {
          kind: 'edit',
          target: resourceName(WF),
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: 'Rejected',
            replacementValue: 'Approved',
          },
        },
        { kind: 'replay', modulePrefix: checkout.projectPrefix },
      ),
    );

    // The recorded replacement must win; falling back to the new-card state
    // ('Draft') would silently migrate the card to the wrong state.
    const refetched = checkout.cardTree.cards().find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Approved');
  });

  it('apply without replacementValue migrates cards to the new-card state', async () => {
    const cardKey = await seedCardInState('Rejected');
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
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
    const refetched = checkout.cardTree.cards().find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Draft');
  });

  it('applyCascade recognizes an initial transition with an empty fromState array', async () => {
    const cardKey = await seedCardInState('Rejected');

    // Both [''] and [] mark the new-card transition elsewhere in the
    // codebase (template.ts, workflow-resource.ts); the fallback must too.
    const wfPath = join(
      projectPath,
      '.cards',
      'local',
      'workflows',
      'decision.json',
    );
    const wf = JSON.parse(await readFile(wfPath, 'utf-8'));
    for (const t of wf.transitions) {
      if (t.fromState.includes('')) t.fromState = [];
    }
    await writeFile(wfPath, JSON.stringify(wf));
    checkout = new Checkout(projectPath);
    await checkout.populateCaches();

    await checkout.lock.write(SYSTEM_FRAME, () =>
      new ResourceMutations(checkout).apply(
        {
          kind: 'edit',
          target: resourceName(WF),
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: { name: 'Rejected', category: 'closed' },
          },
        },
        { kind: 'replay', modulePrefix: checkout.projectPrefix },
      ),
    );

    const refetched = checkout.cardTree.cards().find((c) => c.key === cardKey)!;
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
    checkout = new Checkout(projectPath);
    await checkout.populateCaches();

    await checkout.lock.write(SYSTEM_FRAME, () =>
      new ResourceMutations(checkout).apply(
        {
          kind: 'edit',
          target: resourceName(WF),
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: { name: 'Rejected', category: 'closed' },
          },
        },
        { kind: 'replay', modulePrefix: checkout.projectPrefix },
      ),
    );

    const refetched = checkout.cardTree.cards().find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Rejected');
  });

  it('applyCascade tolerates a missing workflow (no migration, no throw)', async () => {
    const cardKey = await seedCardInState('Rejected');

    await checkout.lock.write(SYSTEM_FRAME, () =>
      new ResourceMutations(checkout).apply(
        {
          kind: 'edit',
          target: resourceName('decision/workflows/nonexistent'),
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: { name: 'Rejected', category: 'closed' },
          },
        },
        { kind: 'replay', modulePrefix: checkout.projectPrefix },
      ),
    );

    const refetched = checkout.cardTree.cards().find((c) => c.key === cardKey)!;
    expect(refetched.metadata?.workflowState).toBe('Rejected');
  });
});
