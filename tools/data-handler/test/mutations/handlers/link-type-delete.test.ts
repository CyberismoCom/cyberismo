import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeDeleteHandler } from '../../../src/mutations/handlers/link-type-delete.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

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
});
