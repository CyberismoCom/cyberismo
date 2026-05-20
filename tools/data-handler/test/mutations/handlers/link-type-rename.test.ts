import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeRenameHandler } from '../../../src/mutations/handlers/link-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

// Reuse the existing decision-records fixture.
const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-link-type-rename');

describe('LinkTypeRenameHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a card link that uses the 'test' link type so the cascade has
    // something to rewrite.
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

  it('matches a link-type rename input', () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('previewed counts include cards that reference the link type', async () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.affectedLinkCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(false);
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

  it('isBreaking is true', () => {
    const handler = new LinkTypeRenameHandler();
    expect(handler.isBreaking).toBe(true);
  });

  it('reports the affected card file paths for fingerprinting', async () => {
    const handler = new LinkTypeRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/linkTypes/test`),
        newIdentifier: 'is-caused-by',
      },
    };
    const paths = await handler.affectedFilePaths(ctx);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      expect(p).toMatch(/index\.json$/);
    }
  });
});
