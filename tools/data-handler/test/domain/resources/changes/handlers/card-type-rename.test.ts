import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../../../src/shared/utils/file-utils.js';
import type { Checkout } from '../../../../../src/infra/checkout.js';
import { getTestProject } from '../../../../helpers/test-utils.js';
import { resourceName } from '../../../../../src/shared/utils/resource-utils.js';
import { Workspace } from '../../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../../src/infra/tx/tx-record.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-rename');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let checkout: Checkout;

describe('CardTypeRenameHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', '..', '..', 'test-data'), testDir);
    checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('rewrites cardType in every affected card after apply', async () => {
    const oldName = `${checkout.projectPrefix}/cardTypes/decision`;
    const newName = `${checkout.projectPrefix}/cardTypes/choice`;
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: 'choice',
    });

    for (const card of checkout.cardTree.cards()) {
      expect(card.metadata?.cardType).not.toBe(oldName);
    }
    // The card type file itself has the new name.
    const renamed = checkout.resources.byType(newName, 'cardTypes').show();
    expect(renamed.name).toBe(newName);
  });

  it('rewrites occurrences in link-type sourceCardTypes/destinationCardTypes', async () => {
    const oldName = `${checkout.projectPrefix}/cardTypes/decision`;
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'rename' as const,
      target: resourceName(oldName),
      newIdentifier: 'choice',
    });
    for (const lt of checkout.resources.linkTypes()) {
      const data = lt.data!;
      expect(data.sourceCardTypes).not.toContain(oldName);
      expect(data.destinationCardTypes).not.toContain(oldName);
    }
  });
});

describe('CardTypeRenameHandler module scope', () => {
  const moduleTmpDir = join(import.meta.dirname, 'tmp-card-type-rename-module');
  const projectPath = join(moduleTmpDir, 'proj');
  let moduleProject: Checkout;
  let localCardMetadataFile: string;

  beforeEach(async () => {
    await mkdir(projectPath, { recursive: true });
    await copyDir(
      join(
        baseDir,
        '..',
        '..',
        '..',
        '..',
        'test-data',
        'valid',
        'decision-records',
      ),
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
    await expect(
      Workspace.over(moduleProject, SYSTEM_ACTOR).changes.apply({
        kind: 'rename' as const,
        target: resourceName('mymod/cardTypes/dummy'),
        newIdentifier: 'renamed',
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
