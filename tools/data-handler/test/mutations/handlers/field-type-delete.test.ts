import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Checkout } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { Workspace } from '../../../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../src/utils/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

const fieldName = () => `${checkout.projectPrefix}/fieldTypes/testField`;
const cardTypeName = () => `${checkout.projectPrefix}/cardTypes/decision`;

function seedField() {
  writeFileSync(
    join(
      decisionRecordsPath,
      '.cards',
      'local',
      'fieldTypes',
      'testField.json',
    ),
    JSON.stringify(
      {
        name: 'decision/fieldTypes/testField',
        displayName: 'Test Field',
        description: 'A seeded field type for delete handler tests',
        dataType: 'shortText',
      },
      null,
      2,
    ),
  );
}

// Register the field on the decision card type and seed a value onto its cards.
async function seedCardTypeAndCardValues() {
  await checkout.resources
    .byType(cardTypeName(), 'cardTypes')
    .update(
      { key: 'customFields' },
      { name: 'add' as const, target: { name: fieldName() } },
    );
  const cards = checkout.cardTree
    .cards()
    .filter((c) => c.metadata?.cardType === cardTypeName());
  for (const card of cards) {
    card.metadata![fieldName()] = 'a value';
    await checkout.updateCardMetadata(card, card.metadata!);
  }
}

describe('FieldTypeDeleteHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    seedField();
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    await seedCardTypeAndCardValues();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('deletes an unused field type resource from disk', async () => {
    const name = `${checkout.projectPrefix}/fieldTypes/unusedField`;
    await checkout.resources
      .byType(name, 'fieldTypes')
      .createFieldType('shortText');
    expect(checkout.resources.exists(name)).toBe(true);

    await Workspace.over(checkout, SYSTEM_ACTOR).updateCmd.apply({
      kind: 'delete',
      target: resourceName(name),
    });
    expect(checkout.resources.exists(name)).toBe(false);
  });

  it('deletes an in-use field type resource from disk', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).updateCmd.apply({
      kind: 'delete',
      target: resourceName(fieldName()),
    });
    expect(checkout.resources.exists(fieldName())).toBe(false);
  });

  it('strips the field from every card type that declares it', async () => {
    expect(
      checkout.resources
        .byType(cardTypeName(), 'cardTypes')
        .data?.customFields?.some((f) => f.name === fieldName()),
    ).toBe(true);

    await Workspace.over(checkout, SYSTEM_ACTOR).updateCmd.apply({
      kind: 'delete',
      target: resourceName(fieldName()),
    });

    expect(
      checkout.resources
        .byType(cardTypeName(), 'cardTypes')
        .data?.customFields?.some((f) => f.name === fieldName()),
    ).toBe(false);
  });

  // The card type stops declaring the field, which leaves the stored value
  // dormant rather than deleting it - the same outcome as removing the field
  // from the card type directly. 'cyberismo clean' reports it as 'undeclared'.
  it('leaves the stored value dormant on every affected card', async () => {
    const before = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.[fieldName()] === 'a value');
    expect(before.length).toBeGreaterThan(0);

    await Workspace.over(checkout, SYSTEM_ACTOR).updateCmd.apply({
      kind: 'delete',
      target: resourceName(fieldName()),
    });

    const after = checkout.cardTree
      .cards()
      .filter((c) => c.metadata?.[fieldName()] === 'a value');
    expect(after).toHaveLength(before.length);
  });

  it('rejects deleting a module-owned field type', async () => {
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).updateCmd.apply({
        kind: 'delete',
        target: resourceName('mymod/fieldTypes/dummy'),
      }),
    ).rejects.toThrow(
      'Cannot delete resource mymod/fieldTypes/dummy: It is a module resource',
    );
  });
});
