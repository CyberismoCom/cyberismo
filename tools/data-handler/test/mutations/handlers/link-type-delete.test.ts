import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeDeleteHandler } from '../../../src/mutations/handlers/link-type-delete.js';
import { copyDir, deleteDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { createLinkSeededProject } from '../helpers.js';

const tmpDir = join(import.meta.dirname, 'tmp-link-type-delete');

describe('LinkTypeDeleteHandler', () => {
  let project: Project;

  beforeEach(async () => {
    project = await createLinkSeededProject(tmpDir);
  });
  afterEach(async () => {
    await deleteDir(tmpDir);
  });

  it('apply strips matching links and deletes the resource', async () => {
    const handler = new LinkTypeDeleteHandler();
    const linkTypeName = `${project.projectPrefix}/linkTypes/test`;
    await handler.apply({
      project,
      input: { kind: 'delete', target: resourceName(linkTypeName) },
    });

    for (const card of project.cards(undefined)) {
      const links = card.metadata?.links ?? [];
      expect(links.some((l) => l.linkType === linkTypeName)).toBe(false);
    }
    expect(project.resources.exists(linkTypeName)).toBe(false);
  });
});

describe('LinkTypeDeleteHandler module scope', () => {
  const moduleTmpDir = join(import.meta.dirname, 'tmp-link-type-delete-module');
  const projectPath = join(moduleTmpDir, 'proj');
  let project: Project;
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

    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await deleteDir(moduleTmpDir);
  });

  // The full apply() cannot succeed here: usage() counts the module card's
  // reference, so resource.delete() refuses. The cascade is what owns the
  // local-only card scoping, so pin it directly.
  it('local delete cascade leaves module template card links untouched', async () => {
    const handler = new LinkTypeDeleteHandler();
    await handler.applyCascade({
      project,
      input: {
        kind: 'delete',
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      },
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
    const handler = new LinkTypeDeleteHandler();
    await expect(
      handler.apply({
        project,
        input: {
          kind: 'delete',
          target: resourceName('mymod/linkTypes/dummy'),
        },
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
