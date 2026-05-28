// tools/data-handler/test/mutations/handlers/field-type-enum-remove.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeEnumRemoveHandler } from '../../../src/mutations/handlers/field-type-enum-remove.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';
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
    await project.populateCaches();

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
    await new ResourceMutations(project).apply(
      {
        kind: 'edit',
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'low' } },
      },
      { bypassFingerprint: true },
    );
    for (const card of project.cards(undefined)) {
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
  });

  it('applying with replacementValue rewrites instead of nulling', async () => {
    await new ResourceMutations(project).apply(
      {
        kind: 'edit',
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: {
          name: 'remove' as const,
          target: { enumValue: 'low' },
          replacementValue: { enumValue: 'medium' },
        },
      },
      { bypassFingerprint: true },
    );
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

  describe('foreign-module replay (apply only, foreign target)', () => {
    it('nulls local cards holding the removed enum value without touching the module file', async () => {
      const dedicatedPath = join(tmpDir, `proj-foreign-enum-rm-${Date.now()}`);
      await mkdir(dedicatedPath, { recursive: true });
      await copyDir(FIXTURE_PATH, dedicatedPath);

      // Seed module 'foo' with the enum value already removed (post-op state).
      const fooModuleDir = join(dedicatedPath, '.cards', 'modules', 'foo');
      const fooFieldTypesDir = join(fooModuleDir, 'fieldTypes');
      await mkdir(fooFieldTypesDir, { recursive: true });
      await writeFile(
        join(fooModuleDir, 'cardsConfig.json'),
        JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
      );
      const moduleFilePath = join(fooFieldTypesDir, 'priority.json');
      const moduleFileContent = JSON.stringify({
        name: 'foo/fieldTypes/priority',
        displayName: '',
        dataType: 'enum',
        enumValues: [{ enumValue: 'high' }],
      });
      await writeFile(moduleFilePath, moduleFileContent);

      // Seed a local card still carrying the removed enum value 'low'.
      const cardIndexPath = join(dedicatedPath, 'cardRoot', 'decision_5', 'index.json');
      const cardData = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
      cardData['foo/fieldTypes/priority'] = 'low';
      await writeFile(cardIndexPath, JSON.stringify(cardData));

      const foreignProject = new Project(dedicatedPath);
      await foreignProject.populateCaches();

      // Replay: remove 'low' from module enum (already gone from module file).
      await new ResourceMutations(foreignProject).apply(
        {
          kind: 'edit',
          target: resourceName('foo/fieldTypes/priority'),
          updateKey: { key: 'enumValues' as const },
          operation: { name: 'remove' as const, target: { enumValue: 'low' } },
        },
        { bypassFingerprint: true },
      );

      // Local card value was nulled.
      const updatedCard = foreignProject.findCard('decision_5');
      expect(updatedCard.metadata?.['foo/fieldTypes/priority']).toBeNull();

      // Module file byte-identical to seed (untouched).
      const moduleFileAfter = await readFile(moduleFilePath, 'utf-8');
      expect(moduleFileAfter).toBe(moduleFileContent);
    });
  });
});
