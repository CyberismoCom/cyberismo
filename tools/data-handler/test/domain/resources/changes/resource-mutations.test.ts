import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Checkout } from '../../../../src/state/checkout/checkout.js';
import { resourceName } from '../../../../src/shared/utils/resource-utils.js';
import { copyDir, deleteDir } from '../../../../src/shared/utils/file-utils.js';
import { Workspace } from '../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../src/infra/tx/tx-record.js';

const testDir = join(import.meta.dirname, 'tmp-resource-mutations');
const fixturePath = join(testDir, 'valid', 'decision-records');

describe('ResourceMutations.apply', () => {
  let checkout: Checkout;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    checkout = new Checkout(fixturePath);
    await checkout.populateCaches();
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('apply() succeeds for a non-cascading edit', async () => {
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${checkout.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: {
        name: 'change' as const,
        target: 'Decision card type',
        to: 'New',
      },
    };
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).changes.apply(input),
    ).resolves.toBeUndefined();
  });
});
