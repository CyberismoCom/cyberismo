import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Checkout } from '../../../src/containers/project.js';
import { copyDir, deleteDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { createLinkSeededProject } from '../helpers.js';
import { Workspace } from '../../../src/workspace/workspace.js';
import { SYSTEM_ACTOR } from '../../../src/utils/tx-record.js';

const tmpDir = join(import.meta.dirname, 'tmp-link-type-delete');

describe('LinkTypeDeleteHandler', () => {
  let checkout: Checkout;

  beforeEach(async () => {
    checkout = await createLinkSeededProject(tmpDir);
  });
  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('apply strips matching links and deletes the resource', async () => {
    const linkTypeName = `${checkout.projectPrefix}/linkTypes/test`;
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(linkTypeName),
    });

    for (const card of checkout.cardTree.cards()) {
      const links = card.metadata?.links ?? [];
      expect(links.some((l) => l.linkType === linkTypeName)).toBe(false);
    }
    expect(checkout.resources.exists(linkTypeName)).toBe(false);
  });
});

describe('LinkTypeDeleteHandler module scope', () => {
  const moduleTmpDir = join(import.meta.dirname, 'tmp-link-type-delete-module');
  const projectPath = join(moduleTmpDir, 'proj');
  let checkout: Checkout;
  let moduleCardMetadataFile: string;
  let localCardMetadataFile: string;

  beforeEach(async () => {
    await mkdir(projectPath, { recursive: true });
    await copyDir(
      join(
        import.meta.dirname,
        '..',
        '..',
        'test-data',
        'valid',
        'decision-records',
      ),
      projectPath,
    );

    // Seed a module template card whose metadata links use the local link
    // type being deleted. Module-owned cards must never be rewritten from
    // the consumer side; this pins the local-only card enumeration of the
    // cascade.
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

    // Seed a local card that references both the local link type and a
    // module-owned link type.
    localCardMetadataFile = join(
      projectPath,
      'cardRoot',
      'decision_5',
      'index.json',
    );
    const localCard = JSON.parse(
      await readFile(localCardMetadataFile, 'utf-8'),
    );
    localCard.links = [
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
      { linkType: 'mymod/linkTypes/dummy', cardKey: 'decision_6' },
    ];
    await writeFile(localCardMetadataFile, JSON.stringify(localCard, null, 4));

    checkout = new Checkout(projectPath);
    await checkout.populateCaches();
  });
  afterEach(async () => {
    await deleteDir(moduleTmpDir);
  });

  // The cascade is local-only: deleting a local link type strips it from local
  // cards but must leave module-owned card links untouched.
  it('local delete leaves module template card links untouched', async () => {
    await Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
      kind: 'delete',
      target: resourceName(`${checkout.projectPrefix}/linkTypes/test`),
    });

    const localCard = JSON.parse(
      await readFile(localCardMetadataFile, 'utf-8'),
    );
    expect(localCard.links).toEqual([
      { linkType: 'mymod/linkTypes/dummy', cardKey: 'decision_6' },
    ]);
    const moduleCard = JSON.parse(
      await readFile(moduleCardMetadataFile, 'utf-8'),
    );
    expect(moduleCard.links).toEqual([
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
    ]);
  });

  it('rejects a module link-type delete before stripping local card links', async () => {
    await expect(
      Workspace.over(checkout, SYSTEM_ACTOR).changes.apply({
        kind: 'delete',
        target: resourceName('mymod/linkTypes/dummy'),
      }),
    ).rejects.toThrow(
      'Cannot delete resource mymod/linkTypes/dummy: It is a module resource',
    );

    const localCard = JSON.parse(
      await readFile(localCardMetadataFile, 'utf-8'),
    );
    expect(localCard.links).toEqual([
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
      { linkType: 'mymod/linkTypes/dummy', cardKey: 'decision_6' },
    ]);
  });
});
