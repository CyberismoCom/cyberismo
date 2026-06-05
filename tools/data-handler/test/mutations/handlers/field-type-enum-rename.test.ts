import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { FieldTypeEnumRenameHandler } from '../../../src/mutations/handlers/field-type-enum-rename.js';
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

async function seedCardValues() {
  const cards = project
    .cards(undefined)
    .filter((c) => c.metadata && c.metadata.cardType);
  for (const card of cards) {
    card.metadata![fieldName()] = 'low';
    await project.updateCardMetadata(card, card.metadata!);
  }
}

describe('FieldTypeEnumRenameHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    seedEnumField();
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    await seedCardValues();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches change on enumValues where enumValue differs', () => {
    const handler = new FieldTypeEnumRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'change' as const,
          target: { enumValue: 'low' },
          to: { enumValue: 'minor' },
        },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('does not match a change that only edits enumDisplayValue', () => {
    const handler = new FieldTypeEnumRenameHandler();
    const ctx = {
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
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('renames the value in the field definition', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: {
        name: 'change' as const,
        target: { enumValue: 'low' },
        to: { enumValue: 'minor' },
      },
    });
    const updated = project.resources.byType(fieldName(), 'fieldTypes').show();
    const values = (updated.enumValues ?? []).map((e) => e.enumValue);
    expect(values).toContain('minor');
    expect(values).not.toContain('low');
  });

  it('leaves card values untouched', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: {
        name: 'change' as const,
        target: { enumValue: 'low' },
        to: { enumValue: 'minor' },
      },
    });
    // The enum definition is updated only; existing cards keep their old value.
    const anyStillLow = project
      .cards(undefined)
      .some((c) => c.metadata?.[fieldName()] === 'low');
    expect(anyStillLow).toBe(true);
  });
});
