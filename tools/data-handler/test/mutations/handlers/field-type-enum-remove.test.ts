import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { FieldTypeEnumRemoveHandler } from '../../../src/mutations/handlers/field-type-enum-remove.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';
import type { Operation } from '../../../src/resources/resource-object.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-enum-remove');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

const fieldName = () => `${project.projectPrefix}/fieldTypes/testEnum`;

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

// Register the enum field on the decision card type so the legacy replacement
// cascade (which only touches cards of card types declaring the field) has a
// reference to follow, then seed the value 'low' onto those cards.
async function seedCardTypeAndCardValues() {
  const cardTypeName = `${project.projectPrefix}/cardTypes/decision`;
  await project.resources
    .byType(cardTypeName, 'cardTypes')
    .update({ key: 'customFields' }, {
      name: 'add',
      target: { name: fieldName() },
    } as Operation<{ name: string }>);
  const cards = project
    .cards(undefined)
    .filter((c) => c.metadata?.cardType === cardTypeName);
  for (const card of cards) {
    card.metadata![fieldName()] = 'low';
    await project.updateCardMetadata(card, card.metadata!);
  }
}

describe('FieldTypeEnumRemoveHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    seedEnumField();
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    await seedCardTypeAndCardValues();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches remove on enumValues', () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'low' } },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('removes the value from the field definition', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: { name: 'remove' as const, target: { enumValue: 'low' } },
    });
    const updated = project.resources.byType(fieldName(), 'fieldTypes').show();
    const values = (updated.enumValues ?? []).map((e) => e.enumValue);
    expect(values).not.toContain('low');
  });

  it('rewrites card values when a replacementValue is provided', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: {
        name: 'remove' as const,
        target: { enumValue: 'low' },
        replacementValue: { enumValue: 'medium' },
      },
    });
    const cards = project
      .cards(undefined)
      .filter((c) => c.metadata?.[fieldName()] !== undefined);
    for (const card of cards) {
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
    const anyMedium = cards.some((c) => c.metadata?.[fieldName()] === 'medium');
    expect(anyMedium).toBe(true);
  });

  it('leaves card values untouched when no replacement is given (legacy behavior)', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: { name: 'remove' as const, target: { enumValue: 'low' } },
    });
    // The legacy path only replaces values when a replacementValue is given;
    // with none, cards keep their now-orphaned value (they are NOT nulled).
    const cards = project
      .cards(undefined)
      .filter((c) => c.metadata?.[fieldName()] !== undefined);
    const anyStillLow = cards.some((c) => c.metadata?.[fieldName()] === 'low');
    expect(anyStillLow).toBe(true);
  });
});
