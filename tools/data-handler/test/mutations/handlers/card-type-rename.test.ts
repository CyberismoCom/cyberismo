import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeRenameHandler } from '../../../src/mutations/handlers/card-type-rename.js';
import { dispatch } from '../../../src/mutations/dispatcher.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-rename');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('CardTypeRenameHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('routes a CardType rename input to this handler (breaking)', () => {
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
        newIdentifier: 'choice',
      },
    };
    const { handler, breaking } = dispatch(ctx);
    expect(handler).toBeInstanceOf(CardTypeRenameHandler);
    expect(breaking).toBe(true);
  });

  it('rewrites cardType in every affected card after apply', async () => {
    const oldName = `${project.projectPrefix}/cardTypes/decision`;
    const newName = `${project.projectPrefix}/cardTypes/choice`;
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: 'choice',
    });

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
    await mutations.apply({
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: 'choice',
    });
    for (const lt of project.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(oldName);
      expect(data.destinationCardTypes).not.toContain(oldName);
    }
  });
});

describe('CardTypeRenameHandler module scope', () => {
  const moduleTmpDir = join(import.meta.dirname, 'tmp-card-type-rename-module');
  const projectPath = join(moduleTmpDir, 'proj');
  let moduleProject: Project;
  let localCardMetadataFile: string;

  beforeEach(async () => {
    await mkdir(projectPath, { recursive: true });
    await copyDir(
      join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records'),
      projectPath,
    );

    // Seed a module-owned card type and a local card that uses it.
    const moduleCardTypesDir = join(
      projectPath,
      '.cards',
      'modules',
      'mymod',
      'cardTypes',
    );
    await mkdir(moduleCardTypesDir, { recursive: true });
    await writeFile(
      join(moduleCardTypesDir, 'dummy.json'),
      JSON.stringify({
        name: 'mymod/cardTypes/dummy',
        displayName: 'Module card type',
        workflow: 'decision/workflows/decision',
        customFields: [],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      }),
    );

    localCardMetadataFile = join(
      projectPath,
      'cardRoot',
      'decision_5',
      'index.json',
    );
    const localCard = JSON.parse(
      await readFile(localCardMetadataFile, 'utf-8'),
    );
    localCard.cardType = 'mymod/cardTypes/dummy';
    await writeFile(localCardMetadataFile, JSON.stringify(localCard, null, 4));

    moduleProject = getTestProject(projectPath);
    await moduleProject.populateCaches();
  });
  afterEach(() => {
    rmSync(moduleTmpDir, { recursive: true, force: true });
  });

  it('rejects a module card-type rename before rewriting local card metadata', async () => {
    const handler = new CardTypeRenameHandler();
    await expect(
      handler.apply({
        project: moduleProject,
        input: {
          kind: 'rename' as const,
          target: resourceName('mymod/cardTypes/dummy'),
          newIdentifier: 'renamed',
        },
      }),
    ).rejects.toThrow(
      'Cannot rename resource mymod/cardTypes/dummy: It is a module resource',
    );

    const localCard = JSON.parse(
      await readFile(localCardMetadataFile, 'utf-8'),
    );
    expect(localCard.cardType).toBe('mymod/cardTypes/dummy');
  });
});
