import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('fieldType delete routing and cascade', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('deletes an unused field type resource from disk', async () => {
    const name = `${project.projectPrefix}/fieldTypes/unusedField`;
    await project.resources
      .byType(name, 'fieldTypes')
      .createFieldType('shortText');
    expect(project.resources.exists(name)).toBe(true);

    const mutations = new ResourceMutations(project);
    await mutations.apply({ kind: 'delete', target: resourceName(name) });

    expect(project.resources.exists(name)).toBe(false);
  });

  it('cascades when deleting a field type used by a card type', async () => {
    // 'finished' is referenced by the decision card type's customFields.
    const name = `${project.projectPrefix}/fieldTypes/finished`;
    const cardTypeName = `${project.projectPrefix}/cardTypes/decision`;
    const cardType = project.resources.byType(cardTypeName, 'cardTypes');
    expect(cardType.data?.customFields?.some((f) => f.name === name)).toBe(true);

    const mutations = new ResourceMutations(project);
    await mutations.apply({ kind: 'delete', target: resourceName(name) });

    // The field type is gone, and the cascade stripped it from the card type.
    expect(project.resources.exists(name)).toBe(false);
    expect(cardType.data?.customFields?.some((f) => f.name === name)).toBe(
      false,
    );
    // No remaining card carries the deleted field key.
    const anyCardHasField = project
      .cards(undefined)
      .some((c) => c.metadata && name in c.metadata);
    expect(anyCardHasField).toBe(false);
  });
});
