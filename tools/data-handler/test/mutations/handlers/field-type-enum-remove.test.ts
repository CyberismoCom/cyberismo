// tools/data-handler/test/mutations/handlers/field-type-enum-remove.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeEnumRemoveHandler } from '../../../src/mutations/handlers/field-type-enum-remove.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-field-type-enum-remove');

describe('FieldTypeEnumRemoveHandler', () => {
  let project: Project;
  let projectPath: string;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/testEnum`;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a new enum field type because the fixture lacks one.
    const enumFieldPath = join(
      projectPath,
      '.cards',
      'local',
      'fieldTypes',
      'testEnum.json',
    );
    await writeFile(
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

    project = new Project(projectPath);
    await project.initialize();

    // Ensure at least one card carries the soon-to-be-removed enum value.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[fieldName()] = 'low';
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
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
  });

  it('preview reports data loss when no replacement is provided', async () => {
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
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
  });

  it('preview does not flag data loss when replacementValue is set', async () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'remove' as const,
          target: { enumValue: 'low' },
          replacementValue: { enumValue: 'medium' },
        },
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('applying without replacement nulls the field on every affected card', async () => {
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
    await handler.apply(ctx);
    for (const card of project.cards(undefined)) {
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
  });

  it('applying with replacementValue rewrites instead of nulling', async () => {
    const handler = new FieldTypeEnumRemoveHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'remove' as const,
          target: { enumValue: 'low' },
          replacementValue: { enumValue: 'medium' },
        },
      },
    };
    await handler.apply(ctx);
    let anyCardHasMedium = false;
    for (const card of project.cards(undefined)) {
      if (card.metadata?.[fieldName()] === 'medium') anyCardHasMedium = true;
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
    expect(anyCardHasMedium).toBe(true);
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeEnumRemoveHandler().isBreaking).toBe(true);
  });
});
