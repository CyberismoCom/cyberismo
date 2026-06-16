import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { FieldTypeDeleteHandler } from '../../../src/mutations/handlers/field-type-delete.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

const fieldName = () => `${project.projectPrefix}/fieldTypes/testField`;
const cardTypeName = () => `${project.projectPrefix}/cardTypes/decision`;

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
  await project.resources
    .byType(cardTypeName(), 'cardTypes')
    .update(
      { key: 'customFields' },
      { name: 'add' as const, target: { name: fieldName() } },
    );
  const cards = project
    .cards(undefined)
    .filter((c) => c.metadata?.cardType === cardTypeName());
  for (const card of cards) {
    card.metadata![fieldName()] = 'a value';
    await project.updateCardMetadata(card, card.metadata!);
  }
}

describe('FieldTypeDeleteHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    seedField();
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    await seedCardTypeAndCardValues();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('deletes an unused field type resource from disk', async () => {
    const name = `${project.projectPrefix}/fieldTypes/unusedField`;
    await project.resources
      .byType(name, 'fieldTypes')
      .createFieldType('shortText');
    expect(project.resources.exists(name)).toBe(true);

    await new ResourceMutations(project).apply({
      kind: 'delete',
      target: resourceName(name),
    });
    expect(project.resources.exists(name)).toBe(false);
  });

  it('deletes an in-use field type resource from disk', async () => {
    await new ResourceMutations(project).apply({
      kind: 'delete',
      target: resourceName(fieldName()),
    });
    expect(project.resources.exists(fieldName())).toBe(false);
  });

  it('strips the field from every card type that declares it', async () => {
    expect(
      project.resources
        .byType(cardTypeName(), 'cardTypes')
        .data?.customFields?.some((f) => f.name === fieldName()),
    ).toBe(true);

    await new ResourceMutations(project).apply({
      kind: 'delete',
      target: resourceName(fieldName()),
    });

    expect(
      project.resources
        .byType(cardTypeName(), 'cardTypes')
        .data?.customFields?.some((f) => f.name === fieldName()),
    ).toBe(false);
  });

  it('removes the field key from every affected card', async () => {
    const before = project
      .cards(undefined)
      .filter((c) => c.metadata && fieldName() in c.metadata);
    expect(before.length).toBeGreaterThan(0);

    await new ResourceMutations(project).apply({
      kind: 'delete',
      target: resourceName(fieldName()),
    });

    const after = project
      .cards(undefined)
      .filter((c) => c.metadata && fieldName() in c.metadata);
    expect(after).toHaveLength(0);
  });

  it('applyCascade strips the field without deleting the resource', async () => {
    await new FieldTypeDeleteHandler().applyCascade({
      project,
      input: { kind: 'delete', target: resourceName(fieldName()) },
    });

    // The cascade rewrote consumers but left the field type resource in place.
    expect(project.resources.exists(fieldName())).toBe(true);
    expect(
      project.resources
        .byType(cardTypeName(), 'cardTypes')
        .data?.customFields?.some((f) => f.name === fieldName()),
    ).toBe(false);
  });

  it('rejects deleting a module-owned field type', async () => {
    await expect(
      new FieldTypeDeleteHandler().apply({
        project,
        input: {
          kind: 'delete',
          target: resourceName('mymod/fieldTypes/dummy'),
        },
      }),
    ).rejects.toThrow(
      'Cannot delete resource mymod/fieldTypes/dummy: It is a module resource',
    );
  });
});
