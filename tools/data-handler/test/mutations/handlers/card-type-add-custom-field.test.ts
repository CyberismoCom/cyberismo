import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeAddCustomFieldHandler } from '../../../src/mutations/handlers/card-type-add-custom-field.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-add-field');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeAddCustomFieldHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches an add operation on customFields', () => {
    const handler = new CardTypeAddCustomFieldHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        updateKey: { key: 'customFields' },
        operation: {
          name: 'add' as const,
          target: { name: `${project.projectPrefix}/fieldTypes/finished` },
        },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('writes null for the new field on every affected card', async () => {
    const handler = new CardTypeAddCustomFieldHandler();
    const newField = `${project.projectPrefix}/fieldTypes/finished`;
    // Pick a field that is not already in the decision card type's customFields
    // — or use a fresh field type added via the fixture. (Adjust if needed.)
    const cardTypeName = `${project.projectPrefix}/cardTypes/simplepage`;
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName),
        updateKey: { key: 'customFields' },
        operation: {
          name: 'add' as const,
          target: { name: newField },
        },
      },
    };
    await handler.apply(ctx);
    const cards = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
    for (const card of cards) {
      expect(card.metadata).toHaveProperty(newField);
      expect(card.metadata![newField]).toBeNull();
    }
  });
});
