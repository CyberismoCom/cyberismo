import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeDeleteHandler } from '../../../src/mutations/handlers/card-type-delete.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

const baseDir = import.meta.dirname;
const FIXTURE_PATH = join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records');
const testDir = join(baseDir, 'tmp-card-type-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeDeleteHandler', () => {
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

  it('matches a CardType delete input', () => {
    const handler = new CardTypeDeleteHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(cardTypeName()),
        },
      }),
    ).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview reports data loss and counts cards', async () => {
    const handler = new CardTypeDeleteHandler();
    const preview = await handler.preview({
      project,
      input: { kind: 'delete', target: resourceName(cardTypeName()) },
    });
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
  });

  it('deletes every card of this type', async () => {
    const before = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName(),
    );
    expect(before.length).toBeGreaterThan(0);

    const mutations = new ResourceMutations(project);
    await mutations.apply(
      { kind: 'delete', target: resourceName(cardTypeName()) },
      { bypassFingerprint: true },
    );
    // Re-read after apply (caches were invalidated by removeCard calls).
    await project.populateCaches();
    const after = project.cards(undefined).filter(
      (c) => c.metadata?.cardType === cardTypeName(),
    );
    expect(after).toHaveLength(0);
  });

  it('strips the card type from every link types sourceCardTypes/destinationCardTypes', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      { kind: 'delete', target: resourceName(cardTypeName()) },
      { bypassFingerprint: true },
    );
    for (const lt of project.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(cardTypeName());
      expect(data.destinationCardTypes).not.toContain(cardTypeName());
    }
  });

  it('deletes the card type resource file from disk', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      { kind: 'delete', target: resourceName(cardTypeName()) },
      { bypassFingerprint: true },
    );
    expect(project.resources.exists(cardTypeName())).toBe(false);
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('strips local link-type refs and local cards; leaves module card-type file untouched', async () => {
    const projPath = join(testDir, `proj-foreign-del-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a card type (already deleted from the module's perspective
    // means it's still on disk — applyModules would have removed it on reinstall, but
    // for this test we seed it as still present so we can verify it's not touched).
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleCardTypesDir = join(moduleDir, 'cardTypes');
    await mkdir(moduleCardTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
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

    // Seed a local card that uses the foreign card type.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = 'foo/cardTypes/task';
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    // Seed a local link type referencing the foreign card type.
    const localLinkTypePath = join(projPath, '.cards', 'local', 'linkTypes', 'testTypes.json');
    const lt = JSON.parse(await readFile(localLinkTypePath, 'utf-8')) as Record<string, unknown>;
    (lt['sourceCardTypes'] as string[]).push('foo/cardTypes/task');
    await writeFile(localLinkTypePath, JSON.stringify(lt));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      { kind: 'delete', target: resourceName('foo/cardTypes/task') },
      { bypassFingerprint: true },
    );

    // Local card was deleted.
    await foreignProject.populateCaches();
    const cards = foreignProject.cards(undefined).filter(
      (c) => c.metadata?.cardType === 'foo/cardTypes/task',
    );
    expect(cards).toHaveLength(0);

    // Local link type no longer references the foreign card type.
    const updatedLT = foreignProject.resources.linkTypes()
      .find((l) => l.data?.name === 'decision/linkTypes/testTypes');
    expect(updatedLT?.data?.sourceCardTypes).not.toContain('foo/cardTypes/task');

    // Module card-type file was NOT deleted.
    expect(existsSync(moduleCTPath)).toBe(true);
    const moduleFileBytes = await readFile(moduleCTPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleCTContent);
  });
});
