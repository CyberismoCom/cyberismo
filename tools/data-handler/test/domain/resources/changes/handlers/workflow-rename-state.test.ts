import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../../../src/infra/checkout.js';
import { route } from '../../../../../src/domain/resources/changes/route.js';
import { resourceName } from '../../../../../src/shared/utils/resource-utils.js';
import { copyDir } from '../../../../../src/shared/utils/file-utils.js';
import { Workspace } from '../../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../../src/infra/tx/tx-record.js';
import { updateCardMetadata } from '../../../../../src/domain/cards/update.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename-state');

const WF = 'decision/workflows/decision';

describe('WorkflowRenameStateHandler', () => {
  let checkout: Checkout;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    checkout = new Checkout(projectPath);
    await checkout.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('derives op=rename-member when the state name identity changes', () => {
    const op = route({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'change',
        target: { name: 'Draft', category: 'initial' },
        to: { name: 'DraftNew', category: 'initial' },
      },
    }).op;
    expect(op).toBe('rename-member');
  });

  it('keeps op=change for a category-only edit (no state-name identity change)', () => {
    const op = route({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'change',
        target: { name: 'Draft', category: 'initial' },
        to: { name: 'Draft', category: 'active' },
      },
    }).op;
    expect(op).toBe('change');
  });

  it('apply rewrites workflowState on affected cards and transitions', async () => {
    // Place a card in 'Draft'.
    const target = checkout.cardTree
      .cards()
      .find((c) => c.metadata?.cardType === 'decision/cardTypes/decision')!;
    target.metadata!.workflowState = 'Draft';
    await updateCardMetadata(checkout, target, target.metadata!);
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'change',
        target: { name: 'Draft', category: 'initial' },
        to: { name: 'DraftNew', category: 'initial' },
      },
    });

    const refetched = checkout.cardTree
      .cards()
      .find((c) => c.key === target.key)!;
    expect(refetched.metadata?.workflowState).toBe('DraftNew');

    const wf = checkout.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).toContain('DraftNew');
    expect(wf.data!.states.map((s) => s.name)).not.toContain('Draft');
    for (const t of wf.data!.transitions) {
      expect(t.toState).not.toBe('Draft');
      expect(t.fromState).not.toContain('Draft');
    }
  });
});
