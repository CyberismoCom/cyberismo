import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../../../src/state/checkout/checkout.js';
import { resourceName } from '../../../../../src/shared/utils/resource-utils.js';
import { copyDir } from '../../../../../src/shared/utils/file-utils.js';
import { Workspace } from '../../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../../src/infra/tx/tx-record.js';

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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename');

describe('WorkflowRenameHandler', () => {
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

  it('apply rewrites the workflow reference in dependent card types', async () => {
    const oldName = 'decision/workflows/decision';
    const newName = 'decision/workflows/decision-v2';
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'rename',
      target: resourceName(oldName),
      newIdentifier: 'decision-v2',
    });

    // No card type still references the old workflow name; the card type that
    // used 'decision' now references the new name.
    for (const ct of checkout.resources.cardTypes()) {
      if (ct.data) {
        expect(ct.data.workflow).not.toBe(oldName);
      }
    }
    const decisionCt = checkout.resources
      .byType('decision/cardTypes/decision', 'cardTypes')
      .show();
    expect(decisionCt!.workflow).toBe(newName);

    // The workflow file itself has the new name.
    const renamed = checkout.resources.byType(newName, 'workflows').show();
    expect(renamed!.name).toBe(newName);
  });

  it('throws when the workflow does not exist', async () => {
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
        kind: 'rename',
        target: resourceName('decision/workflows/does-not-exist'),
        newIdentifier: 'whatever',
      }),
    ).rejects.toThrow();
  });
});
