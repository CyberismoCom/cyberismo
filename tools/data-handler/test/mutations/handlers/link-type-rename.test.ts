import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeRenameHandler } from '../../../src/mutations/handlers/link-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir, deleteDir } from '../../../src/utils/file-utils.js';
import { createLinkSeededProject } from '../helpers.js';

const tmpDir = join(import.meta.dirname, 'tmp-link-type-rename');

describe('LinkTypeRenameHandler', () => {
  let project: Project;

  beforeEach(async () => {
    project = await createLinkSeededProject(tmpDir);
  });
  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('applying rewrites every card that referenced the old link type', async () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    };
    await handler.apply(ctx);
    const cards = project.cards(undefined);
    const oldRef = `${project.projectPrefix}/linkTypes/test`;
    const newRef = `${project.projectPrefix}/linkTypes/is-caused-by`;
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
  let project: Project;
  let moduleCardMetadataFile: string;

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

    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await deleteDir(moduleTmpDir);
  });

  it('leaves module template card links untouched by the cascade', async () => {
    const handler = new LinkTypeRenameHandler();
    await handler.apply({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    });

    expect(
      project.resources.exists(
        `${project.projectPrefix}/linkTypes/is-caused-by`,
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
