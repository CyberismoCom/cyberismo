import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { FieldTypeRenameHandler } from '../../../src/mutations/handlers/field-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-rename');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('FieldTypeRenameHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches a field-type rename input', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
        newIdentifier: 'completed',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('does not match a link-type rename', () => {
    const handler = new FieldTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    };
    expect(handler.matches(ctx)).toBe(false);
  });

  it('renames the resource on disk via the legacy cascade', async () => {
    // Rename an unused field type. (Renaming a field referenced by a card type
    // is not supported on the legacy path: FieldTypeResource.rename's
    // updateCardTypes cascade re-validates the now-removed old field name and
    // throws — see the rejection test below. The handler faithfully preserves
    // that behavior, so the happy path renames an unreferenced field.)
    const oldName = `${project.projectPrefix}/fieldTypes/spare`;
    const newName = `${project.projectPrefix}/fieldTypes/spareRenamed`;
    await project.resources
      .byType(oldName, 'fieldTypes')
      .createFieldType('shortText');

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: 'spareRenamed',
    });

    const renamed = project.resources.byType(newName, 'fieldTypes').show();
    expect(renamed.name).toBe(newName);
    expect(project.resources.exists(oldName)).toBe(false);
  });

  it('reproduces the legacy rejection when renaming a field referenced by a card type', async () => {
    // 'finished' is referenced by the decision card type's customFields. The
    // legacy updateCardTypes cascade re-validates the old name after the
    // resource is renamed and throws. The handler must not mask this.
    const oldName = `${project.projectPrefix}/fieldTypes/finished`;
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'completed',
      }),
    ).rejects.toThrow(/does not exist in the project/);
  });
});
