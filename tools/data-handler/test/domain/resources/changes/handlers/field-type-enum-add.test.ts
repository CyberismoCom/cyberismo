import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../../../src/shared/utils/file-utils.js';
import type { Checkout } from '../../../../../src/infra/checkout/checkout.js';
import { getTestProject } from '../../../../helpers/test-utils.js';
import { resourceName } from '../../../../../src/shared/utils/resource-utils.js';
import { Workspace } from '../../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../../src/infra/tx/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-enum-add');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

const fieldName = () => `${checkout.projectPrefix}/fieldTypes/testEnum`;

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
    await copyDir(join(baseDir, '..', '..', '..', '..', 'test-data'), testDir);
    seedEnumField();
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('adds the new value to the field definition', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'enumValues' as const },
      operation: { name: 'add' as const, target: { enumValue: 'critical' } },
    });
    const updated = checkout.resources.byType(fieldName(), 'fieldTypes').show();
    const values = (updated.enumValues ?? []).map((e) => e.enumValue);
    expect(values).toContain('critical');
  });
});
