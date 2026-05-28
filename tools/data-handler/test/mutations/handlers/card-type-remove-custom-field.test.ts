import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeRemoveCustomFieldHandler } from '../../../src/mutations/handlers/card-type-remove-custom-field.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

const baseDir = import.meta.dirname;
const FIXTURE_PATH = join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records');
const testDir = join(baseDir, 'tmp-card-type-remove-field');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeRemoveCustomFieldHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const cardTypeName = () => `${project.projectPrefix}/cardTypes/decision`;
  const fieldName = () => `${project.projectPrefix}/fieldTypes/finished`;

  it('matches a remove operation on customFields', () => {
    const handler = new CardTypeRemoveCustomFieldHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName(cardTypeName()),
          updateKey: { key: 'customFields' },
          operation: { name: 'remove', target: { name: fieldName() } },
        },
      }),
    ).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview reports data loss', async () => {
    const handler = new CardTypeRemoveCustomFieldHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'edit',
        target: resourceName(cardTypeName()),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: fieldName() } },
      },
    });
    expect(preview.dataLossExpected).toBe(true);
  });

  it('removes the field key from every card of this type', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(cardTypeName()),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: fieldName() } },
      },
      { bypassFingerprint: true },
    );
    const cards = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName(),
    );
    for (const card of cards) {
      expect(card.metadata).not.toHaveProperty(fieldName());
    }
  });

  it('strips the field from alwaysVisibleFields and optionallyVisibleFields', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName(cardTypeName()),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: fieldName() } },
      },
      { bypassFingerprint: true },
    );
    const ct = project.resources.byType(cardTypeName(), 'cardTypes').show();
    expect(ct.alwaysVisibleFields ?? []).not.toContain(fieldName());
    expect(ct.optionallyVisibleFields ?? []).not.toContain(fieldName());
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('strips field from local cards of foreign card type; leaves module card-type file untouched', async () => {
    const projPath = join(testDir, `proj-foreign-remove-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a card type that has the field already removed (post-op state).
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleCardTypesDir = join(moduleDir, 'cardTypes');
    const moduleFieldTypesDir = join(moduleDir, 'fieldTypes');
    await mkdir(moduleCardTypesDir, { recursive: true });
    await mkdir(moduleFieldTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    // The field type still exists in the module (not deleted).
    await writeFile(
      join(moduleFieldTypesDir, 'urgency.json'),
      JSON.stringify({ name: 'foo/fieldTypes/urgency', displayName: 'Urgency', dataType: 'shortText' }),
    );
    // Module card type NO LONGER has urgency in customFields (post-remove state).
    const moduleCTPath = join(moduleCardTypesDir, 'task.json');
    const moduleCTContent = JSON.stringify({
      name: 'foo/cardTypes/task',
      displayName: 'Task',
      workflow: 'foo/workflows/w',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    });
    await writeFile(moduleCTPath, moduleCTContent);

    // Seed a local card that uses the foreign card type and still has the old field.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = 'foo/cardTypes/task';
    cardMeta['foo/fieldTypes/urgency'] = 'high';
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('foo/cardTypes/task'),
        updateKey: { key: 'customFields' },
        operation: { name: 'remove', target: { name: 'foo/fieldTypes/urgency' } },
      },
      { bypassFingerprint: true },
    );

    // Local card lost the field.
    const updatedCard = foreignProject.findCard(cardKey);
    expect(updatedCard.metadata).not.toHaveProperty('foo/fieldTypes/urgency');

    // Module card-type file was NOT modified.
    const moduleFileBytes = await readFile(moduleCTPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleCTContent);
  });
});
