import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { PlainHandler } from '../../../src/mutations/handlers/plain-handler.js';
import { FieldTypeEnumRemoveHandler } from '../../../src/mutations/handlers/field-type-enum-remove.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-enum-add');
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

describe('fieldType enumValues add routing', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    seedEnumField();
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('routes an add operation on enumValues to the plain handler (non-breaking)', () => {
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'add' as const, target: { enumValue: 'fresh' } },
      },
    });
    expect(handler).toBeInstanceOf(PlainHandler);
    expect(breaking).toBe(false);
  });

  it('routes a remove on enumValues to the remove handler, not the plain add path', () => {
    const { handler } = dispatch({
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'enumValues' as const },
        operation: { name: 'remove' as const, target: { enumValue: 'low' } },
      },
    });
    expect(handler).toBeInstanceOf(FieldTypeEnumRemoveHandler);
  });

  it('adds the new value to the field definition', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: { name: 'add' as const, target: { enumValue: 'critical' } },
    });
    const updated = project.resources.byType(fieldName(), 'fieldTypes').show();
    const values = (updated.enumValues ?? []).map((e) => e.enumValue);
    expect(values).toContain('critical');
  });
});
