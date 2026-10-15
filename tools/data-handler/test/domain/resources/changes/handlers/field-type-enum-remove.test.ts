import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../../../src/shared/utils/file-utils.js';
import type { Checkout } from '../../../../../src/infra/checkout/checkout.js';
import { getTestProject } from '../../../../helpers/test-utils.js';
import { resourceName } from '../../../../../src/shared/utils/resource-utils.js';
import { ResourceMutations } from '../../../../../src/domain/resources/changes/resource-mutations.js';
import { Workspace } from '../../../../../src/api/workspace/workspace.js';
import {
  SYSTEM_ACTOR,
  SYSTEM_FRAME,
} from '../../../../../src/infra/tx/tx-record.js';
import { updateCardMetadata } from '../../../../../src/domain/cards/update.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-enum-remove');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

const fieldName = () => `${checkout.projectPrefix}/fieldTypes/testEnum`;

function seedEnumField() {
  const enumFieldPath = join(
    decisionRecordsPath,
    '.cards',
    'local',
    'fieldTypes',
    'testEnum.json',
  );
  writeFileSync(
    enumFieldPath,
    JSON.stringify(
      {
        name: 'decision/fieldTypes/testEnum',
        displayName: 'Test Enum',
        description: 'A seeded enum field type for handler tests',
        dataType: 'enum',
        enumValues: [
          { enumValue: 'low' },
          { enumValue: 'medium' },
          { enumValue: 'high' },
        ],
      },
      null,
      2,
    ),
  );
}

// Register the enum field on the decision card type so the replacement cascade
// (which only touches cards of card types declaring the field) has a reference
// to follow, then seed the value 'low' onto those cards.
async function seedCardTypeAndCardValues() {
  const cardTypeName = `${checkout.projectPrefix}/cardTypes/decision`;
  await checkout.resources.byType(cardTypeName, 'cardTypes').update(
    { key: 'customFields' },
    {
      name: 'add' as const,
      target: { name: fieldName() },
    },
  );
  const cards = checkout.cardTree
    .cards()
    .filter((c) => c.metadata?.cardType === cardTypeName);
  for (const card of cards) {
    card.metadata![fieldName()] = 'low';
    await updateCardMetadata(checkout, card, card.metadata!);
  }
}

describe('FieldTypeEnumRemoveHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', '..', '..', 'test-data'), testDir);
    seedEnumField();
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    await seedCardTypeAndCardValues();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('removes the value from the field definition', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: { name: 'remove' as const, target: { enumValue: 'low' } },
    });
    const updated = checkout.resources.byType(fieldName(), 'fieldTypes').show();
    const values = (updated.enumValues ?? []).map((e) => e.enumValue);
    expect(values).not.toContain('low');
  });

  it('rewrites card values when a replacementValue is provided', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: {
        name: 'remove' as const,
        target: { enumValue: 'low' },
        replacementValue: { enumValue: 'medium' },
      },
    });
    const cards = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.[fieldName()] !== undefined);
    for (const card of cards) {
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
    const anyMedium = cards.some((c) => c.metadata?.[fieldName()] === 'medium');
    expect(anyMedium).toBe(true);
  });

  it('applyCascade tolerates bare-string target and replacementValue shapes', async () => {
    // Recorded log entries (and authoring surfaces) may carry bare strings
    // instead of EnumDefinition objects; a replayed cascade must handle both.
    const mutations = new ResourceMutations(checkout);
    await checkout.lock.write(SYSTEM_FRAME, () =>
      mutations.apply(
        {
          kind: 'edit' as const,
          target: resourceName(fieldName()),
          updateKey: { key: 'enumValues' as const },
          operation: {
            name: 'remove' as const,
            target: 'low',
            replacementValue: 'medium',
          },
        },
        { kind: 'replay', modulePrefix: checkout.projectPrefix },
      ),
    );
    const cards = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.[fieldName()] !== undefined);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.metadata?.[fieldName()]).toBe('medium');
    }
  });

  it('leaves card values untouched when no replacement is given', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: { name: 'remove' as const, target: { enumValue: 'low' } },
    });
    // Values are only replaced when a replacementValue is given; with none,
    // cards keep their orphaned value (they are NOT nulled).
    const cards = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.[fieldName()] !== undefined);
    const anyStillLow = cards.some((c) => c.metadata?.[fieldName()] === 'low');
    expect(anyStillLow).toBe(true);
  });
});
