import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../src/utils/file-utils.js';
import type { Project } from '../../src/containers/project.js';
import { getTestProject } from '../helpers/test-utils.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-field-type-integration');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('FieldType mutation engine end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('apply → log entry for a FieldType delete (unused field)', async () => {
    const name = `${project.projectPrefix}/fieldTypes/unusedField`;
    await project.resources
      .byType(name, 'fieldTypes')
      .createFieldType('shortText');

    const mutations = new ResourceMutations(project);
    await mutations.apply({ kind: 'delete', target: resourceName(name) });

    expect(project.resources.exists(name)).toBe(false);
    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) => e.operation === 'resource_delete' && e.target === name,
      ),
    ).toBe(true);
  });

  it('apply → log entry for a FieldType rename (unused field)', async () => {
    // Renaming a field still referenced by a card type is rejected, so rename
    // an unused field.
    const name = `${project.projectPrefix}/fieldTypes/spare`;
    await project.resources
      .byType(name, 'fieldTypes')
      .createFieldType('shortText');
    const target = resourceName(name);
    const mutations = new ResourceMutations(project);

    await mutations.apply({
      kind: 'rename',
      target,
      newIdentifier: 'spareRenamed',
    });

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) => e.operation === 'resource_rename' && e.target === name,
      ),
    ).toBe(true);
  });

  it('apply → log entry for a FieldType dataType change', async () => {
    const target = resourceName(`${project.projectPrefix}/fieldTypes/finished`);
    const mutations = new ResourceMutations(project);

    await mutations.apply({
      kind: 'edit',
      target,
      updateKey: { key: 'dataType' },
      operation: { name: 'change', target: 'boolean', to: 'shortText' },
    });

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.operation === 'resource_update' &&
          e.target === `${project.projectPrefix}/fieldTypes/finished`,
      ),
    ).toBe(true);
  });

  it('adding an enum value is non-breaking (no log entry)', async () => {
    const enumFieldPath = join(
      decisionRecordsPath,
      '.cards',
      'local',
      'fieldTypes',
      'testEnum.json',
    );
    writeFileSync(
      enumFieldPath,
      JSON.stringify({
        name: 'decision/fieldTypes/testEnum',
        displayName: 'Test Enum',
        dataType: 'enum',
        enumValues: [{ enumValue: 'low' }, { enumValue: 'high' }],
      }),
    );
    const freshProject = getTestProject(decisionRecordsPath);
    await freshProject.populateCaches();

    const mutations = new ResourceMutations(freshProject);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(`${freshProject.projectPrefix}/fieldTypes/testEnum`),
      updateKey: { key: 'enumValues' },
      operation: { name: 'add', target: { enumValue: 'medium' } },
    });

    const entries = await ConfigurationLogger.entries(freshProject.basePath);
    expect(entries).toHaveLength(0);
  });

  it('display-only changes route to the plain handler (no log entry)', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(`${project.projectPrefix}/fieldTypes/finished`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change', target: 'Finished', to: 'Done' },
    });

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });
});
