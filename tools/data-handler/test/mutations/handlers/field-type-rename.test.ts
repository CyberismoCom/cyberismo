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
    // Rename an unused field type. (An authoring rename of a field referenced
    // by a local card type is rejected by the explicit guard in apply(), so
    // the happy path renames an unreferenced field.)
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
    // on local resources), but it pins the enumeration scope: the cascade and
    // the authoring guard must consider LOCAL card types only, so the module
    // file stays as-is and the rename is not rejected.
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
    // explicit guard in apply() refuses the authoring rename before touching
    // the resource.
    const oldName = `${project.projectPrefix}/fieldTypes/finished`;
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'completed',
      }),
    ).rejects.toThrow(/referenced by card type/);
    expect(project.resources.exists(oldName)).toBe(true);
  });

  it('applyCascade rewrites local references when the old field type is gone (replay)', async () => {
    // Replay-style: the module tree is already at its final version, so only
    // the NEW field type exists on disk. The cascade must derive everything
    // from the input and never resolve the old name.
    const oldName = 'mymod/fieldTypes/oldField';
    const newName = 'mymod/fieldTypes/newField';
    const moduleFieldTypesDir = join(
      decisionRecordsPath,
      '.cards',
      'modules',
      'mymod',
      'fieldTypes',
    );
    mkdirSync(moduleFieldTypesDir, { recursive: true });
    writeFileSync(
      join(moduleFieldTypesDir, 'newField.json'),
      JSON.stringify({
        name: newName,
        displayName: 'New field',
        dataType: 'shortText',
      }),
    );

    // A local card type referencing the module field under its OLD name.
    const cardTypeFile = join(
      decisionRecordsPath,
      '.cards',
      'local',
      'cardTypes',
      'modfields.json',
    );
    writeFileSync(
      cardTypeFile,
      JSON.stringify({
        name: 'decision/cardTypes/modfields',
        displayName: 'Uses module field',
        workflow: 'decision/workflows/simple',
        customFields: [{ name: oldName, isCalculated: true }],
        alwaysVisibleFields: [oldName],
        optionallyVisibleFields: [],
      }),
    );

    // A local card holding a value under the old key and content referencing
    // the old name.
    const cardDir = join(decisionRecordsPath, 'cardRoot', 'decision_5');
    const metadataFile = join(cardDir, 'index.json');
    const metadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));
    metadata[oldName] = 'keep-me';
    writeFileSync(metadataFile, JSON.stringify(metadata, null, 4));
    const contentFile = join(cardDir, 'index.adoc');
    writeFileSync(contentFile, `Field ${oldName} is shown here.\n`);

    const replayProject = getTestProject(decisionRecordsPath);
    await replayProject.populateCaches();

    const handler = new FieldTypeRenameHandler();
    await handler.applyCascade({
      project: replayProject,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'newField',
      },
    });

    const cardType = JSON.parse(readFileSync(cardTypeFile, 'utf-8'));
    expect(cardType.customFields).toEqual([
      { name: newName, isCalculated: true },
    ]);
    expect(cardType.alwaysVisibleFields).toEqual([newName]);

    const updatedMetadata = JSON.parse(readFileSync(metadataFile, 'utf-8'));
    expect(updatedMetadata[newName]).toBe('keep-me');
    expect(updatedMetadata).not.toHaveProperty(oldName);

    const content = readFileSync(contentFile, 'utf-8');
    expect(content).toContain(newName);
    expect(content).not.toContain(oldName);
  });

  it('applyCascade is a safe no-op when nothing references the field type', async () => {
    // Neither the old nor the new field type exists and nothing references
    // either name; the cascade must still resolve.
    const handler = new FieldTypeRenameHandler();
    await expect(
      handler.applyCascade({
        project,
        input: {
          kind: 'rename' as const,
          target: resourceName('mymod/fieldTypes/ghost'),
          newIdentifier: 'phantom',
        },
      }),
    ).resolves.toBeUndefined();
  });
});
