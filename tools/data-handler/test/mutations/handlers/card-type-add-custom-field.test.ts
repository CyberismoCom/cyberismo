import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

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

  it('writes null for the new field on every affected card', async () => {
    const newField = `${project.projectPrefix}/fieldTypes/finished`;
    // 'finished' is not part of the simplepage card type's customFields.
    const cardTypeName = `${project.projectPrefix}/cardTypes/simplepage`;
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(cardTypeName),
      updateKey: { key: 'customFields' },
      operation: {
        name: 'add' as const,
        target: { name: newField },
      },
    });
    const cards = project
      .cards(undefined)
      .filter((c) => c.metadata?.cardType === cardTypeName);
    for (const card of cards) {
      expect(card.metadata).toHaveProperty(newField);
      expect(card.metadata![newField]).toBeNull();
    }
  });
});
