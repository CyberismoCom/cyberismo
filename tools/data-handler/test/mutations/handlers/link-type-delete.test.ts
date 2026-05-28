import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeDeleteHandler } from '../../../src/mutations/handlers/link-type-delete.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

// Reuse the existing decision-records fixture.
const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-link-type-delete');

describe('LinkTypeDeleteHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a card link that uses the 'test' link type so the cascade has
    // something to strip.
    const decision5Path = join(
      projectPath,
      'cardRoot',
      'decision_5',
      'index.json',
    );
    const decision5 = JSON.parse(await readFile(decision5Path, 'utf-8'));
    decision5.links = [
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
    ];
    await writeFile(decision5Path, JSON.stringify(decision5, null, 4));

    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches only delete inputs on linkTypes', () => {
    const handler = new LinkTypeDeleteHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        },
      }),
    ).toBe(true);
    expect(
      handler.matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName(`${project.projectPrefix}/cardTypes/foo`),
        },
      }),
    ).toBe(false);
  });

  it('is breaking', () => {
    expect(new LinkTypeDeleteHandler().isBreaking).toBe(true);
  });

  it('preview reports affected card and link counts', async () => {
    const handler = new LinkTypeDeleteHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'delete',
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      },
    });
    expect(preview.affectedLinkCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.summary).toMatch(/removes? .* link/i);
  });

  it('apply strips matching links and deletes the resource', async () => {
    const linkTypeName = `${project.projectPrefix}/linkTypes/test`;
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      { kind: 'delete', target: resourceName(linkTypeName) },
      { bypassFingerprint: true },
    );

    for (const card of project.cards(undefined)) {
      const links = card.metadata?.links ?? [];
      expect(links.some((l) => l.linkType === linkTypeName)).toBe(false);
    }
    expect(project.resources.exists(linkTypeName)).toBe(false);
  });

  it('affectedFilePaths returns every card index.json that holds a matching link', async () => {
    const handler = new LinkTypeDeleteHandler();
    const paths = await handler.affectedFilePaths({
      project,
      input: {
        kind: 'delete',
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
      },
    });
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).toMatch(/index\.json$/);
    }
  });

  it('applyCascade and applyResourceOp exist (split interface)', () => {
    const handler = new LinkTypeDeleteHandler();
    expect(typeof handler.applyCascade).toBe('function');
    expect(typeof handler.applyResourceOp).toBe('function');
    expect(handler.apply).toBeUndefined();
  });

  it('validate rejects foreign-target interactive deletion', async () => {
    const handler = new LinkTypeDeleteHandler();
    await expect(
      handler.validate!({
        project,
        input: {
          kind: 'delete',
          target: resourceName('foreignmodule/linkTypes/test'),
        },
      }),
    ).rejects.toThrow(/module resource/i);
  });
});

describe('LinkTypeDeleteHandler — foreign-module replay', () => {
  const tmpForeign = join(import.meta.dirname, 'tmp-link-type-delete-foreign');

  afterEach(async () => {
    await rm(tmpForeign, { recursive: true, force: true });
  });

  it('strips local card link block referencing foreign link type; leaves module file untouched', async () => {
    const projPath = join(tmpForeign, `proj-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a link type already in post-delete state (file absent).
    // We only need the cardsConfig so the project loads as a module.
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleLinkTypesDir = join(moduleDir, 'linkTypes');
    await mkdir(moduleLinkTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    // Seed a "surviving" link type file that must NOT be deleted.
    const survivorContent = JSON.stringify({
      name: 'foo/linkTypes/keeps',
      displayName: 'Keeps',
      outboundDisplayName: 'keeps',
      inboundDisplayName: 'kept by',
      sourceCardTypes: [],
      destinationCardTypes: [],
      enableLinkDescription: false,
    });
    const survivorPath = join(moduleLinkTypesDir, 'keeps.json');
    await writeFile(survivorPath, survivorContent);

    // Seed a LOCAL card with a link referencing the OLD (to-be-deleted) foreign link type.
    const cardIndexPath = join(projPath, 'cardRoot', 'decision_5', 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['links'] = [
      { linkType: 'foo/linkTypes/gone', cardKey: 'decision_6' },
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
    ];
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay scenario) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'delete',
        target: resourceName('foo/linkTypes/gone'),
      },
      { bypassFingerprint: true },
    );

    // Local card's link to the deleted type was stripped.
    await foreignProject.populateCaches();
    const updatedCard = foreignProject.findCard('decision_5');
    const links = updatedCard.metadata?.links ?? [];
    expect(links.some((l) => l.linkType === 'foo/linkTypes/gone')).toBe(false);
    // The local link type was NOT stripped.
    expect(links.some((l) => l.linkType === 'decision/linkTypes/test')).toBe(true);

    // The surviving module file was NOT touched.
    const survivorBytes = await readFile(survivorPath, 'utf-8');
    expect(survivorBytes).toBe(survivorContent);
  });
});
