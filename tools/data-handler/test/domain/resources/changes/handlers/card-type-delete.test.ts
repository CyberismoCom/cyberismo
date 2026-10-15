import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../../../src/shared/utils/file-utils.js';
import type { Checkout } from '../../../../../src/state/checkout/checkout.js';
import { getTestProject } from '../../../../helpers/test-utils.js';
import { resourceName } from '../../../../../src/shared/utils/resource-utils.js';
import { Workspace } from '../../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../../src/infra/tx/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

describe('CardTypeDeleteHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', '..', '..', 'test-data'), testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const cardTypeName = () => `${checkout.projectPrefix}/cardTypes/decision`;

  it('deletes every card of this type', async () => {
    const before = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.cardType === cardTypeName());
    expect(before.length).toBeGreaterThan(0);
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(cardTypeName()),
    });
    // Re-read after apply (caches were invalidated by removeCard calls).
    await checkout.populateCaches();
    const after = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.cardType === cardTypeName());
    expect(after).toHaveLength(0);
  });

  it('strips the card type from every link type sourceCardTypes/destinationCardTypes', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(cardTypeName()),
    });
    for (const lt of checkout.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(cardTypeName());
      expect(data.destinationCardTypes).not.toContain(cardTypeName());
    }
  });

  it('deletes the card type resource file from disk', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(cardTypeName()),
    });
    expect(checkout.resources.exists(cardTypeName())).toBe(false);
  });
});
