import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeAddCustomFieldHandler } from '../../../src/mutations/handlers/card-type-add-custom-field.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

const baseDir = import.meta.dirname;
const FIXTURE_PATH = join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records');
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
    const newField = `${project.projectPrefix}/fieldTypes/finished`;
    // Pick a field that is not already in the decision card type's customFields
    // — or use a fresh field type added via the fixture. (Adjust if needed.)
    const cardTypeName = `${project.projectPrefix}/cardTypes/simplepage`;
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit' as const,
        target: resourceName(cardTypeName),
        updateKey: { key: 'customFields' },
        operation: {
          name: 'add' as const,
          target: { name: newField },
        },
      },
      { bypassFingerprint: true },
    );
    const cards = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName,
    );
    for (const card of cards) {
      expect(card.metadata).toHaveProperty(newField);
      expect(card.metadata![newField]).toBeNull();
    }
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('adds null field on local cards of foreign card type; leaves module card-type file untouched', async () => {
    const projPath = join(testDir, `proj-foreign-add-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a card type (post-op: field already added to the JSON).
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleCardTypesDir = join(moduleDir, 'cardTypes');
    const moduleFieldTypesDir = join(moduleDir, 'fieldTypes');
    await mkdir(moduleCardTypesDir, { recursive: true });
    await mkdir(moduleFieldTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    // Module field type
    await writeFile(
      join(moduleFieldTypesDir, 'urgency.json'),
      JSON.stringify({ name: 'foo/fieldTypes/urgency', displayName: 'Urgency', dataType: 'shortText' }),
    );
    const moduleCTPath = join(moduleCardTypesDir, 'task.json');
    const moduleCTContent = JSON.stringify({
      name: 'foo/cardTypes/task',
      displayName: 'Task',
      workflow: 'foo/workflows/w',
      customFields: [{ name: 'foo/fieldTypes/urgency' }],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    });
    await writeFile(moduleCTPath, moduleCTContent);

    // Seed a local card that uses the foreign card type.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = 'foo/cardTypes/task';
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
        operation: { name: 'add', target: { name: 'foo/fieldTypes/urgency' } },
      },
      { bypassFingerprint: true },
    );

    // Local card got null for the new field.
    const updatedCard = foreignProject.findCard(cardKey);
    expect(updatedCard.metadata).toHaveProperty('foo/fieldTypes/urgency');
    expect(updatedCard.metadata!['foo/fieldTypes/urgency']).toBeNull();

    // Module card-type file was NOT modified.
    const moduleFileBytes = await readFile(moduleCTPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleCTContent);
  });
});
