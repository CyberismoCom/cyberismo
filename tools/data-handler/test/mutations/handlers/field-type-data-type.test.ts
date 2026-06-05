import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { FieldTypeDataTypeHandler } from '../../../src/mutations/handlers/field-type-data-type.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-data-type');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

const fieldName = () => `${project.projectPrefix}/fieldTypes/finished`;

describe('FieldTypeDataTypeHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();

    // Ensure at least one card carries 'finished' with a non-null boolean value.
    const cards = project
      .cards(undefined)
      .filter((c) => c.metadata && fieldName() in c.metadata);
    if (cards.length > 0 && cards[0].metadata) {
      cards[0].metadata[fieldName()] = true;
      await project.updateCardMetadata(cards[0], cards[0].metadata);
    }
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches an edit with key=dataType on a field type', () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'dataType' as const },
        operation: {
          name: 'change' as const,
          target: 'boolean',
          to: 'shortText',
        },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('does not match a displayName change', () => {
    const handler = new FieldTypeDataTypeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'displayName' as const },
        operation: { name: 'change' as const, target: 'Finished', to: 'Done' },
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('converts values on every affected card and updates the field definition', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(fieldName()),
      updateKey: { key: 'dataType' as const },
      operation: {
        name: 'change' as const,
        target: 'boolean',
        to: 'shortText',
      },
    });

    const updated = project.resources.byType(fieldName(), 'fieldTypes').show();
    expect(updated.dataType).toBe('shortText');
    for (const card of project.cards(undefined)) {
      const value = card.metadata?.[fieldName()];
      if (value === undefined || value === null) continue;
      expect(typeof value).toBe('string');
    }
  });

  it('rejects a conversion that is not allowed', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'dataType' as const },
        operation: { name: 'change' as const, target: 'boolean', to: 'date' },
      }),
    ).rejects.toThrow(/Cannot change data type/);
  });
});
