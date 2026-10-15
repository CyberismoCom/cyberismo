import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../../src/shared/utils/file-utils.js';
import type { Checkout } from '../../../../src/infra/checkout/checkout.js';
import { getTestProject } from '../../../helpers/test-utils.js';
import { ConfigurationLogger } from '../../../../src/infra/replay-log/configuration-logger.js';
import { resourceName } from '../../../../src/shared/utils/resource-utils.js';
import { Workspace } from '../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../src/infra/tx/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-workflow-integration');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

const WF = 'decision/workflows/decision';

describe('Workflow mutation engine end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', '..', 'test-data'), testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('apply → log entry for a workflow rename, dependent card types rewritten', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'rename',
      target: resourceName(WF),
      newIdentifier: 'decision-v2',
    });

    const newName = 'decision/workflows/decision-v2';
    expect(checkout.resources.exists(newName)).toBe(true);
    const decisionCt = checkout.resources
      .byType('decision/cardTypes/decision', 'cardTypes')
      .show();
    expect(decisionCt!.workflow).toBe(newName);

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(
      entries.some((e) => e.operation === 'resource_rename' && e.target === WF),
    ).toBe(true);
  });

  it('apply → state removal records a log entry', async () => {
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

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(
      entries.some(
        (e) =>
          e.operation === 'resource_update' &&
          e.target === WF &&
          (e.parameters as { key?: string }).key === 'states',
      ),
    ).toBe(true);
  });

  it('apply → state rename records a log entry', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'change',
        target: { name: 'Rejected', category: 'closed' },
        to: { name: 'Declined', category: 'closed' },
      },
    });

    const wf = checkout.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).toContain('Declined');

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(
      entries.some(
        (e) =>
          e.operation === 'resource_update' &&
          e.target === WF &&
          (e.parameters as { key?: string }).key === 'states',
      ),
    ).toBe(true);
  });

  it('apply → add state records NO log entry', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'add',
        target: { name: 'Archived', category: 'closed' },
      },
    });

    const wf = checkout.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).toContain('Archived');

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(entries).toHaveLength(0);
  });

  it('apply → transition change records NO log entry', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'transitions' },
      operation: { name: 'remove', target: 'Deprecate' },
    });

    const wf = checkout.resources.byType(WF, 'workflows')!;
    expect(wf.data!.transitions.map((t) => t.name)).not.toContain('Deprecate');

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(entries).toHaveLength(0);
  });

  it('display-only changes route to the plain handler (no log entry)', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'displayName' },
      operation: {
        name: 'change',
        target: 'Decision based workflow',
        to: 'Decision workflow',
      },
    });

    const wf = checkout.resources.byType(WF, 'workflows')!;
    expect(wf.data!.displayName).toBe('Decision workflow');

    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(entries).toHaveLength(0);
  });

  it('apply → deleting an in-use workflow cascade-deletes dependent card types and logs', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(WF),
    });

    // The workflow and every card type that referenced it are gone.
    expect(checkout.resources.exists(WF)).toBe(false);
    expect(checkout.resources.exists('decision/cardTypes/decision')).toBe(
      false,
    );

    // The delete records a log entry.
    const entries = await ConfigurationLogger.entries(checkout.basePath);
    expect(
      entries.some((e) => e.operation === 'resource_delete' && e.target === WF),
    ).toBe(true);
  });
});
