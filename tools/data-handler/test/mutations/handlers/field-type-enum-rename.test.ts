import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { PlainHandler } from '../../../src/mutations/handlers/plain-handler.js';
import { FieldTypeEnumRenameHandler } from '../../../src/mutations/handlers/field-type-enum-rename.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-enum-rename');
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

// Register the enum field on the decision card type, then seed the value 'low'
// onto every card of that type — mirrors FieldTypeEnumRemoveHandler's setup.
async function seedCardTypeAndCardValues() {
  const cardTypeName = `${project.projectPrefix}/cardTypes/decision`;
  await project.resources.byType(cardTypeName, 'cardTypes').update(
    { key: 'customFields' },
    {
      name: 'add' as const,
      target: { name: fieldName() },
    },
  );
  const cards = project
    .cards(undefined)
    .filter((c) => c.metadata?.cardType === cardTypeName);
  for (const card of cards) {
    card.metadata![fieldName()] = 'low';
    await project.updateCardMetadata(card, card.metadata!);
  }
}

const renameOp = {
  kind: 'edit' as const,
  target: resourceName('decision/fieldTypes/testEnum'),
  updateKey: { key: 'enumValues' as const },
  operation: {
    name: 'change' as const,
    target: { enumValue: 'low' },
    to: { enumValue: 'minor' },
  },
};

describe('FieldTypeEnumRenameHandler', () => {
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

  it('routes a change where enumValue differs as a breaking rename-member', () => {
    const { handler, breaking } = dispatch({ project, input: renameOp });
    expect(handler).toBeInstanceOf(FieldTypeEnumRenameHandler);
    expect(breaking).toBe(true);
  });

  it('routes a change that only edits enumDisplayValue as a non-breaking edit', () => {
    // No identity change: routes to the enumValues wildcard plain row, which is
    // non-breaking.
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'change' as const,
          target: { enumValue: 'low' },
          to: { enumValue: 'low', enumDisplayValue: 'Low priority' },
        },
      },
    });
    expect(handler).toBeInstanceOf(PlainHandler);
    expect(breaking).toBe(false);
  });

  it('renames the value in the field definition', async () => {
    await new ResourceMutations(project).apply(renameOp);
    const updated = project.resources.byType(fieldName(), 'fieldTypes').show();
    const values = (updated.enumValues ?? []).map((e) => e.enumValue);
    expect(values).toContain('minor');
    expect(values).not.toContain('low');
  });

  it('migrates card values to the new value', async () => {
    await new ResourceMutations(project).apply(renameOp);
    const cards = project.cards(undefined);
    const anyStillLow = cards.some((c) => c.metadata?.[fieldName()] === 'low');
    const migrated = cards.filter((c) => c.metadata?.[fieldName()] === 'minor');
    expect(anyStillLow).toBe(false);
    expect(migrated.length).toBeGreaterThan(0);
  });

  it('applyCascade migrates card values without touching the definition', async () => {
    // Rename the definition first, then run the cascade in isolation.
    await project.resources
      .byType(fieldName(), 'fieldTypes')
      .update(renameOp.updateKey, renameOp.operation);

    await new FieldTypeEnumRenameHandler().applyCascade({
      project,
      input: renameOp,
    });

    const anyStillLow = project
      .cards(undefined)
      .some((c) => c.metadata?.[fieldName()] === 'low');
    expect(anyStillLow).toBe(false);
  });
});
