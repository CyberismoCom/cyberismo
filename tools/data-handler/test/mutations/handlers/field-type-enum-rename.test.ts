// tools/data-handler/test/mutations/handlers/field-type-enum-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeEnumRenameHandler } from '../../../src/mutations/handlers/field-type-enum-rename.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-enum-rename');

describe('FieldTypeEnumRenameHandler', () => {
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

    // Ensure at least one card carries the soon-to-be-renamed enum value.
    const cards = project.cards(undefined);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[fieldName()] = 'low';
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const renameOp = {
    name: 'change' as const,
    target: { enumValue: 'low' },
    to: { enumValue: 'minor' },
  };

  it('matches change on enumValues where enumValue differs', () => {
    const handler = new FieldTypeEnumRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: renameOp,
      },
    };
    expect(handler.matches(ctx)).toBe(true);
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

  it('applying find-and-replaces the enum value on every affected card', async () => {
    const handler = new FieldTypeEnumRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: renameOp,
      },
    };
    await handler.apply(ctx);
    for (const card of project.cards(undefined)) {
      expect(card.metadata?.[fieldName()]).not.toBe('low');
    }
  });

  it('isBreaking is true', () => {
    expect(new FieldTypeEnumRenameHandler().isBreaking).toBe(true);
  });
});
