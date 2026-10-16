import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Checkout } from '../../../src/infra/checkout.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';
import { Workspace } from '../../../src/workspace/workspace.js';
import { SYSTEM_ACTOR, SYSTEM_FRAME } from '../../../src/utils/tx-record.js';
import { updateCardMetadata } from '../../../src/cards/update.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-data-type');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

const fieldName = () => `${checkout.projectPrefix}/fieldTypes/finished`;

describe('FieldTypeDataTypeHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();

    // Ensure at least one card carries 'finished' with a non-null boolean value.
    const cards = checkout.cardTree
      .cards()
      .filter((c) => c.metadata && fieldName() in c.metadata);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[fieldName()] = true;
      await updateCardMetadata(checkout, cards[0], cards[0].metadata);
    }
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('converts values on every affected card and updates the field definition', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'dataType' as const },
      operation: {
        name: 'change' as const,
        target: 'boolean',
        to: 'shortText',
      },
    });

    const updated = checkout.resources.byType(fieldName(), 'fieldTypes').show();
    expect(updated.dataType).toBe('shortText');
    for (const card of checkout.cardTree.cards()) {
      const value = card.metadata?.[fieldName()];
      if (value === undefined || value === null) continue;
      expect(typeof value).toBe('string');
    }
  });

  it('applyCascade without a recorded source type leaves unconvertible values untouched', async () => {
    // Scalar change operations may be recorded without 'target' (the old
    // data type). When the conversion cannot be determined, card values must
    // be left as-is rather than cleared.
    const before = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.[fieldName()] != null)
      .map((c) => [c.key, c.metadata![fieldName()]] as const);
    expect(before.length).toBeGreaterThan(0);

    const mutations = new ResourceMutations(checkout);
    await checkout.lock.write(SYSTEM_FRAME, () =>
      mutations.apply(
        {
          kind: 'edit' as const,
          target: resourceName(fieldName()),
          updateKey: { key: 'dataType' as const },
          operation: { name: 'change' as const, to: 'number' },
        },
        { kind: 'replay', modulePrefix: checkout.projectPrefix },
      ),
    );

    for (const [key, value] of before) {
      const card = checkout.cardTree.cards().find((c) => c.key === key);
      expect(card?.metadata?.[fieldName()]).toBe(value);
    }
  });

  it('rejects a conversion that is not allowed', async () => {
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'dataType' as const },
        operation: { name: 'change' as const, target: 'boolean', to: 'date' },
      }),
    ).rejects.toThrow(/Cannot change data type/);
  });
});
