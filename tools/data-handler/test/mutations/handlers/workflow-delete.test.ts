import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../src/infra/checkout.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { Workspace } from '../../../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../src/utils/tx-record.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-delete');

const WF = 'decision/workflows/decision';
const DEPENDENT_CT = 'decision/cardTypes/decision';

describe('WorkflowDeleteHandler', () => {
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

  it('deletes an unused workflow', async () => {
    const unusedName = 'decision/workflows/unused';
    await checkout.resources.byType(unusedName, 'workflows').create();
    await checkout.populateCaches();
    expect(checkout.resources.exists(unusedName)).toBe(true);

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(unusedName),
    });
    await checkout.populateCaches();
    expect(checkout.resources.exists(unusedName)).toBe(false);
  });

  it('cascade-deletes dependent card types when deleting an in-use workflow', async () => {
    expect(checkout.resources.exists(DEPENDENT_CT)).toBe(true);

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(WF),
    });
    await checkout.populateCaches();

    expect(checkout.resources.exists(WF)).toBe(false);
    expect(checkout.resources.exists(DEPENDENT_CT)).toBe(false);
  });

  it('deletes the cards of the dependent card types', async () => {
    const before = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.cardType === DEPENDENT_CT);
    expect(before.length).toBeGreaterThan(0);

    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(WF),
    });
    await checkout.populateCaches();

    const after = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.cardType === DEPENDENT_CT);
    expect(after).toHaveLength(0);
  });

  it('rejects deleting a module-owned workflow', async () => {
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
        kind: 'delete',
        target: resourceName('mymod/workflows/dummy'),
      }),
    ).rejects.toThrow(
      'Cannot delete resource mymod/workflows/dummy: It is a module resource',
    );
  });

  it('throws when the workflow does not exist', async () => {
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
        kind: 'delete',
        target: resourceName('decision/workflows/does-not-exist'),
      }),
    ).rejects.toThrow();
  });
});
