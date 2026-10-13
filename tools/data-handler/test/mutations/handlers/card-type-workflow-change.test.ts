import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Checkout } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { Workspace } from '../../../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../src/utils/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-workflow');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

const cardTypeName = () => `${checkout.projectPrefix}/cardTypes/decision`;
const fromWorkflow = () => `${checkout.projectPrefix}/workflows/decision`;
const toWorkflow = () => `${checkout.projectPrefix}/workflows/simple`;

describe('CardTypeWorkflowChangeHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('rejects incomplete mappings the same way verifyStateMapping does', async () => {
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
          mappingTable: {
            stateMapping: { Draft: 'Created', Approved: 'Approved' },
          },
        },
      }),
    ).rejects.toThrow(/State mapping validation failed/);
  });

  it('applies the state mapping when provided', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit' as const,
      target: resourceName(cardTypeName()),
      updateKey: { key: 'workflow' },
      operation: {
        name: 'change' as const,
        target: fromWorkflow(),
        to: toWorkflow(),
        mappingTable: {
          stateMapping: {
            Draft: 'Created',
            Approved: 'Approved',
            Rejected: 'Deprecated',
            Rerejected: 'Deprecated',
            Deprecated: 'Deprecated',
          },
        },
      },
    });
    const updated = checkout.resources
      .byType(cardTypeName(), 'cardTypes')
      .show();
    expect(updated.workflow).toBe(toWorkflow());
    for (const card of checkout.cardTree.cards()) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(['Created', 'Approved', 'Deprecated']).toContain(
          card.metadata.workflowState,
        );
      }
    }
  });

  it('changes the workflow reference but leaves card states when no mapping is given', async () => {
    const before = new Map(
      checkout.cardTree
        .cards()
        .filter((c) => c.metadata?.cardType === cardTypeName())
        .map((c) => [c.key, c.metadata!.workflowState]),
    );
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit' as const,
      target: resourceName(cardTypeName()),
      updateKey: { key: 'workflow' },
      operation: {
        name: 'change' as const,
        target: fromWorkflow(),
        to: toWorkflow(),
      },
    });

    const updated = checkout.resources
      .byType(cardTypeName(), 'cardTypes')
      .show();
    expect(updated.workflow).toBe(toWorkflow());
    // With no state mapping, card workflowState is untouched.
    for (const card of checkout.cardTree.cards()) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(card.metadata.workflowState).toBe(before.get(card.key));
      }
    }
  });
});
