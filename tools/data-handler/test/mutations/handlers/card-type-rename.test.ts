import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeRenameHandler } from '../../../src/mutations/handlers/card-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

const baseDir = import.meta.dirname;
const FIXTURE_PATH = join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records');
const testDir = join(baseDir, 'tmp-card-type-rename');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeRenameHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(
      join(baseDir, '..', '..', 'test-data'),
      testDir,
    );
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches a CardType rename input', () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('preview counts affected cards and link-type references', async () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('rewrites cardType in every affected card after apply', async () => {
    const oldName = `${project.projectPrefix}/cardTypes/decision`;
    const newName = `${project.projectPrefix}/cardTypes/choice`;
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'choice',
      },
      { bypassFingerprint: true },
    );

    for (const card of project.cards(undefined)) {
      expect(card.metadata?.cardType).not.toBe(oldName);
    }
    // The card type file itself has the new name.
    const renamed = project.resources.byType(newName, 'cardTypes').show();
    expect(renamed.name).toBe(newName);
  });

  it('rewrites occurrences in link-type sourceCardTypes/destinationCardTypes', async () => {
    const oldName = `${project.projectPrefix}/cardTypes/decision`;
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'choice',
      },
      { bypassFingerprint: true },
    );
    for (const lt of project.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(oldName);
      expect(data.destinationCardTypes).not.toContain(oldName);
    }
  });

  it('affectedFilePaths returns the index.json files that will be rewritten', async () => {
    const handler = new CardTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    const paths = await handler.affectedFilePaths(ctx);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.endsWith('index.json'))).toBe(true);
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('rewrites local card cardType ref and link-type refs; leaves module file untouched', async () => {
    const projPath = join(testDir, `proj-foreign-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with the card type already in post-rename state ("newname").
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleCardTypesDir = join(moduleDir, 'cardTypes');
    await mkdir(moduleCardTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    const moduleCTPath = join(moduleCardTypesDir, 'newname.json');
    const moduleCTContent = JSON.stringify({
      name: 'foo/cardTypes/newname',
      displayName: 'Foreign card type (post-rename)',
      workflow: 'foo/workflows/w',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    });
    await writeFile(moduleCTPath, moduleCTContent);

    // Seed a local card referencing the OLD foreign card type name.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = 'foo/cardTypes/oldname';
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    // Seed a local link type that references the OLD foreign card type.
    const localLinkTypePath = join(projPath, '.cards', 'local', 'linkTypes', 'testTypes.json');
    const lt = JSON.parse(await readFile(localLinkTypePath, 'utf-8')) as Record<string, unknown>;
    (lt['sourceCardTypes'] as string[]).push('foo/cardTypes/oldname');
    await writeFile(localLinkTypePath, JSON.stringify(lt));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay scenario) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'rename',
        target: resourceName('foo/cardTypes/oldname'),
        newIdentifier: 'newname',
      },
      { bypassFingerprint: true },
    );

    // Local card cardType was rewritten.
    const updatedCard = foreignProject.findCard(cardKey);
    expect(updatedCard.metadata?.cardType).toBe('foo/cardTypes/newname');

    // Local link type source was rewritten.
    const updatedLT = foreignProject.resources.linkTypes()
      .find((l) => l.data?.name === 'decision/linkTypes/testTypes');
    expect(updatedLT?.data?.sourceCardTypes).toContain('foo/cardTypes/newname');
    expect(updatedLT?.data?.sourceCardTypes).not.toContain('foo/cardTypes/oldname');

    // Module file was NOT touched (bytes unchanged).
    const moduleFileBytes = await readFile(moduleCTPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleCTContent);
  });
});
