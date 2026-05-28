import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeDataTypeHandler } from '../../../src/mutations/handlers/field-type-data-type.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-data-type');

describe('FieldTypeDataTypeHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();

    // Ensure at least one card carries the 'finished' field with a non-null boolean value.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[`${project.projectPrefix}/fieldTypes/finished`] = true;
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const input = (target: string, from: string, to: string) => ({
    kind: 'edit' as const,
    target: resourceName(target),
    updateKey: { key: 'dataType' as const },
    operation: { name: 'change' as const, target: from, to },
  });

  it('matches an edit with key=dataType on a field type', () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: input(`${project.projectPrefix}/fieldTypes/finished`, 'boolean', 'shortText'),
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match a displayName change', () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        updateKey: { key: 'displayName' as const },
        operation: { name: 'change' as const, target: 'A', to: 'B' },
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('shortText ↔ longText is non-data-loss (existing values are preserved)', async () => {
    // Fixture substitution: commitDescription is longText, so we use
    // obsoletedBy (shortText) for the shortText → longText test.
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: input(
        `${project.projectPrefix}/fieldTypes/obsoletedBy`,
        'shortText',
        'longText',
      ),
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('boolean → integer flags potential data loss when values cannot convert', async () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: input(
        `${project.projectPrefix}/fieldTypes/finished`,
        'boolean',
        'integer',
      ),
    };
    const preview = await handler.preview(ctx);
    // boolean → integer is not in the allowed map; preview should warn.
    expect(preview.dataLossExpected).toBe(true);
  });

  it('applying converts values on every affected card', async () => {
    const fieldName = `${project.projectPrefix}/fieldTypes/finished`;
    await new ResourceMutations(project).apply(
      input(fieldName, 'boolean', 'shortText'),
      { bypassFingerprint: true },
    );
    for (const card of project.cards(undefined)) {
      const value = card.metadata?.[fieldName];
      if (value === undefined || value === null) continue;
      // After boolean → shortText the value should be a string like "true"/"false".
      expect(typeof value).toBe('string');
    }
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeDataTypeHandler().isBreaking).toBe(true);
  });

  describe('foreign-module replay (apply only, foreign target)', () => {
    it('converts local card values without touching the module field-type file', async () => {
      const dedicatedPath = join(tmpDir, `proj-foreign-dt-${Date.now()}`);
      await mkdir(dedicatedPath, { recursive: true });
      await copyDir(FIXTURE_PATH, dedicatedPath);

      // Seed module 'foo' with field already at the NEW dataType (post-op state).
      const fooModuleDir = join(dedicatedPath, '.cards', 'modules', 'foo');
      const fooFieldTypesDir = join(fooModuleDir, 'fieldTypes');
      await mkdir(fooFieldTypesDir, { recursive: true });
      await writeFile(
        join(fooModuleDir, 'cardsConfig.json'),
        JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
      );
      const moduleFilePath = join(fooFieldTypesDir, 'score.json');
      const moduleFileContent = JSON.stringify({
        name: 'foo/fieldTypes/score',
        displayName: '',
        dataType: 'shortText',
      });
      await writeFile(moduleFilePath, moduleFileContent);

      // Seed a local card carrying the foreign field with an integer value
      // (pre-op state — still at old dataType 'integer').
      const foreignProject0 = new Project(dedicatedPath);
      await foreignProject0.populateCaches();
      const cards0 = foreignProject0.cards(undefined);
      if (cards0.length > 0 && cards0[0].metadata) {
        cards0[0].metadata['foo/fieldTypes/score'] = 42;
        await foreignProject0.updateCardMetadata(cards0[0], cards0[0].metadata);
      }

      const foreignProject = new Project(dedicatedPath);
      await foreignProject.populateCaches();

      // replay: target is foreign ('foo'). Operation carries from=integer, to=shortText.
      await new ResourceMutations(foreignProject).apply(
        {
          kind: 'edit',
          target: resourceName('foo/fieldTypes/score'),
          updateKey: { key: 'dataType' as const },
          operation: { name: 'change' as const, target: 'integer', to: 'shortText' },
        },
        { bypassFingerprint: true },
      );

      // Local card value converted to string.
      const updatedCards = foreignProject.cards(undefined);
      const cardWithField = updatedCards.find(
        (c) => c.metadata?.['foo/fieldTypes/score'] !== undefined,
      );
      if (cardWithField) {
        const val = cardWithField.metadata!['foo/fieldTypes/score'];
        if (val !== null) {
          expect(typeof val).toBe('string');
        }
      }

      // Module file byte-identical to seed (untouched).
      const moduleFileAfter = await readFile(moduleFilePath, 'utf-8');
      expect(moduleFileAfter).toBe(moduleFileContent);
    });
  });
});
