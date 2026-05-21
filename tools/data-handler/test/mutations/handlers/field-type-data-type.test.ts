import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeDataTypeHandler } from '../../../src/mutations/handlers/field-type-data-type.js';
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
    const handler = new FieldTypeDataTypeHandler();
    const fieldName = `${project.projectPrefix}/fieldTypes/finished`;
    const ctx = {
      project,
      input: input(fieldName, 'boolean', 'shortText'),
    };
    await handler.apply(ctx);
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
});
