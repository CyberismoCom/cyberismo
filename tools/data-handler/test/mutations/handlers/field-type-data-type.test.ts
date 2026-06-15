import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { FieldTypeDataTypeHandler } from '../../../src/mutations/handlers/field-type-data-type.js';
import { PlainHandler } from '../../../src/mutations/handlers/plain-handler.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
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

  it('routes an edit with key=dataType to this handler (breaking)', () => {
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
    const { handler, breaking } = dispatch(ctx);
    expect(handler).toBeInstanceOf(FieldTypeDataTypeHandler);
    expect(breaking).toBe(true);
  });

  it('routes a displayName change to the plain handler, not this one', () => {
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(fieldName()),
        updateKey: { key: 'displayName' as const },
        operation: { name: 'change' as const, target: 'Finished', to: 'Done' },
      },
    };
    const { handler, breaking } = dispatch(ctx);
    expect(handler).not.toBeInstanceOf(FieldTypeDataTypeHandler);
    expect(handler).toBeInstanceOf(PlainHandler);
    expect(breaking).toBe(false);
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
