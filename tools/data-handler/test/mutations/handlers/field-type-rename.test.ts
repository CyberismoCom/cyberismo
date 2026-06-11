import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('renames the resource on disk via the cascade', async () => {
    // Rename an unused field type. (Renaming a field referenced by a card type
    // is rejected: FieldTypeResource.rename's updateCardTypes cascade
    // re-validates the now-removed old field name and throws, so the happy path
    // renames an unreferenced field.)
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

  it('leaves module card types untouched by the cascade', async () => {
    // Seed a module card type whose customFields references the local field
    // type being renamed. The reference is artificial (modules cannot depend
    // on local resources), but it pins the enumeration scope: updateCardTypes
    // must iterate LOCAL card types only, so the module file stays as-is and
    // the rename is not rejected by re-validation of the module's reference.
    const oldName = `${project.projectPrefix}/fieldTypes/spare`;
    const newName = `${project.projectPrefix}/fieldTypes/spareRenamed`;
    const moduleCardTypesDir = join(
      decisionRecordsPath,
      '.cards',
      'modules',
      'mymod',
      'cardTypes',
    );
    const moduleCardTypeFile = join(moduleCardTypesDir, 'modtype.json');
    mkdirSync(moduleCardTypesDir, { recursive: true });
    writeFileSync(
      moduleCardTypeFile,
      JSON.stringify({
        name: 'mymod/cardTypes/modtype',
        displayName: 'Module card type',
        workflow: 'decision/workflows/decision',
        customFields: [{ name: oldName }],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      }),
    );

    // Fresh project so the resource cache collects the seeded module file.
    const moduleProject = getTestProject(decisionRecordsPath);
    await moduleProject.populateCaches();
    await moduleProject.resources
      .byType(oldName, 'fieldTypes')
      .createFieldType('shortText');

    const mutations = new ResourceMutations(moduleProject);
    await mutations.apply({
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: 'spareRenamed',
    });

    expect(moduleProject.resources.exists(newName)).toBe(true);
    const moduleCardType = JSON.parse(
      readFileSync(moduleCardTypeFile, 'utf-8'),
    );
    expect(moduleCardType.customFields).toEqual([{ name: oldName }]);
  });

  it('rejects renaming a field referenced by a card type', async () => {
    // 'finished' is referenced by the decision card type's customFields. The
    // updateCardTypes cascade re-validates the old name after the resource is
    // renamed and throws. The handler must not mask this.
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
