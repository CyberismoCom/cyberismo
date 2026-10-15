import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Checkout } from '../../../../src/infra/checkout.js';
import { resourceName } from '../../../../src/shared/utils/resource-utils.js';
import { copyDir, deleteDir } from '../../../../src/shared/utils/file-utils.js';
import { createLinkSeededProject } from '../helpers.js';
import { Workspace } from '../../../../src/api/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../../src/shared/utils/tx-record.js';

const tmpDir = join(import.meta.dirname, 'tmp-link-type-rename');

describe('LinkTypeRenameHandler', () => {
  let checkout: Checkout;

  beforeEach(async () => {
    checkout = await createLinkSeededProject(tmpDir);
  });
  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('applying rewrites every card that referenced the old link type', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'rename' as const,
      target: resourceName(`${checkout.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    });
    const cards = checkout.cardTree.cards();
    const oldRef = `${checkout.projectPrefix}/linkTypes/test`;
    const newRef = `${checkout.projectPrefix}/linkTypes/is-caused-by`;
    for (const card of cards) {
      for (const link of card.metadata?.links ?? []) {
        expect(link.linkType).not.toBe(oldRef);
        if (link.linkType.endsWith('/linkTypes/is-caused-by')) {
          expect(link.linkType).toBe(newRef);
        }
      }
    }
  });
});

describe('LinkTypeRenameHandler module scope', () => {
  const moduleTmpDir = join(import.meta.dirname, 'tmp-link-type-rename-module');
  const projectPath = join(moduleTmpDir, 'proj');
  let checkout: Checkout;
  let moduleCardMetadataFile: string;

  beforeEach(async () => {
    await mkdir(projectPath, { recursive: true });
    await copyDir(
      join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        'test-data',
        'valid',
        'decision-records',
      ),
      projectPath,
    );

    // Seed a module template card whose metadata links use the link type
    // being renamed. Module-owned cards must never be rewritten from the
    // consumer side; this pins the local-only card enumeration of the cascade.
    const moduleTemplateDir = join(
      projectPath,
      '.cards',
      'modules',
      'mymod',
      'templates',
    );
    const moduleCardDir = join(moduleTemplateDir, 'mytemp', 'c', 'mymod_1');
    moduleCardMetadataFile = join(moduleCardDir, 'index.json');
    await mkdir(moduleCardDir, { recursive: true });
    await writeFile(
      join(moduleTemplateDir, 'mytemp.json'),
      JSON.stringify({
        name: 'mymod/templates/mytemp',
        displayName: 'Module template',
      }),
    );
    await writeFile(
      join(dirname(moduleCardDir), '.schema'),
      JSON.stringify([{ id: 'cardBaseSchema', version: 1 }]),
    );
    await writeFile(
      moduleCardMetadataFile,
      JSON.stringify({
        cardType: 'decision/cardTypes/decision',
        title: 'Module card',
        workflowState: 'Draft',
        rank: '0|a',
        links: [{ linkType: 'decision/linkTypes/test', cardKey: 'decision_6' }],
      }),
    );
    await writeFile(join(moduleCardDir, 'index.adoc'), 'Module card\n');

    checkout = new Checkout(projectPath);
    await checkout.populateCaches();
  });
  afterEach(async () => {
    await deleteDir(moduleTmpDir);
  });

  it('leaves module template card links untouched by the cascade', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'rename' as const,
      target: resourceName(`${checkout.projectPrefix}/linkTypes/test`),
      newIdentifier: 'is-caused-by',
    });

    expect(
      checkout.resources.exists(
        `${checkout.projectPrefix}/linkTypes/is-caused-by`,
      ),
    ).toBe(true);
    const moduleCard = JSON.parse(
      await readFile(moduleCardMetadataFile, 'utf-8'),
    );
    expect(moduleCard.links).toEqual([
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
    ]);
  });
});
