// tools/data-handler/test/mutations/handlers/field-type-enum-add.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { FieldTypeEnumAddHandler } from '../../../src/mutations/handlers/field-type-enum-add.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-field-type-enum-add');

describe('FieldTypeEnumAddHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const enumFieldName = (p: Project) =>
    // No enum field exists in the fixture; percentageReady supports
    // enumValues operations regardless of its declared dataType.
    `${p.projectPrefix}/fieldTypes/percentageReady`;

  it('matches add operation on enumValues', () => {
    const handler = new FieldTypeEnumAddHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(enumFieldName(project)),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'add' as const, target: { enumValue: 'new-value' } },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('does not match remove on enumValues', () => {
    const handler = new FieldTypeEnumAddHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(enumFieldName(project)),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'old' } },
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('is non-breaking and reports zero cascade effects', async () => {
    const handler = new FieldTypeEnumAddHandler();
    expect(handler.isBreaking).toBe(false);
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(enumFieldName(project)),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'add' as const, target: { enumValue: 'fresh' } },
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBe(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  describe('foreign-module replay (apply only, foreign target)', () => {
    it('completes without throwing and does not modify the module file', async () => {
      const dedicatedPath = join(tmpDir, `proj-foreign-enum-add-${Date.now()}`);
      await mkdir(dedicatedPath, { recursive: true });
      await copyDir(FIXTURE_PATH, dedicatedPath);

      // Seed module 'foo' with the field already at post-op state
      // (new enum value already present in the module's installed file).
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
        enumValues: [{ enumValue: 'low' }, { enumValue: 'high' }, { enumValue: 'critical' }],
      });
      await writeFile(moduleFilePath, moduleFileContent);

      const foreignProject = new Project(dedicatedPath);
      await foreignProject.populateCaches();

      // Replay: add 'critical' to module's enum (already present on disk).
      // No consumer cascade needed; should succeed without touching the module file.
      await new ResourceMutations(foreignProject).apply(
        {
          kind: 'edit',
          target: resourceName('foo/fieldTypes/priority'),
          updateKey: { key: 'enumValues' as const },
          operation: { name: 'add' as const, target: { enumValue: 'critical' } },
        },
        { bypassFingerprint: true },
      );

      // Module file byte-identical to seed (untouched).
      const moduleFileAfter = await readFile(moduleFilePath, 'utf-8');
      expect(moduleFileAfter).toBe(moduleFileContent);
    });
  });
});
