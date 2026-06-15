import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { PlainDeleteHandler } from '../../../src/mutations/handlers/plain-handler.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
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

  it('routes a FieldType delete to the plain delete handler (breaking)', () => {
    const { handler, breaking } = dispatch({
      project,
      input: {
        kind: 'delete',
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
      },
    });
    expect(handler).toBeInstanceOf(PlainDeleteHandler);
    expect(breaking).toBe(true);
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

  it('refuses to delete a field type used by a card type', async () => {
    // 'finished' is referenced by the decision card type's customFields.
    const name = `${project.projectPrefix}/fieldTypes/finished`;
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({ kind: 'delete', target: resourceName(name) }),
    ).rejects.toThrow(/used by/);
    expect(project.resources.exists(name)).toBe(true);
  });
});
