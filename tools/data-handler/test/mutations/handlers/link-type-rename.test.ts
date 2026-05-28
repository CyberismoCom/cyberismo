import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { LinkTypeRenameHandler } from '../../../src/mutations/handlers/link-type-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
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
    const mutations = new ResourceMutations(project);
    const oldRef = `${project.projectPrefix}/linkTypes/test`;
    const newRef = `${project.projectPrefix}/linkTypes/is-caused-by`;
    await mutations.apply(
      {
        kind: 'rename' as const,
        target: resourceName(oldRef),
        newIdentifier: 'is-caused-by',
      },
      { bypassFingerprint: true },
    );
    const cards = project.cards(undefined);
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

  it('applyCascade and applyResourceOp exist (split interface)', () => {
    const handler = new LinkTypeRenameHandler();
    expect(typeof handler.applyCascade).toBe('function');
    expect(typeof handler.applyResourceOp).toBe('function');
    expect(handler.apply).toBeUndefined();
  });
});

describe('LinkTypeRenameHandler — foreign-module replay', () => {
  const FIXTURE_PATH = join(
    import.meta.dirname,
    '..',
    '..',
    'test-data',
    'valid',
    'decision-records',
  );
  const tmpForeign = join(import.meta.dirname, 'tmp-link-type-rename-foreign');

  afterEach(async () => {
    await rm(tmpForeign, { recursive: true, force: true });
  });

  it('rewrites local card link block; leaves module link-type file untouched', async () => {
    const projPath = join(tmpForeign, `proj-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with the link type already in post-rename state ("is-caused-by").
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleLinkTypesDir = join(moduleDir, 'linkTypes');
    await mkdir(moduleLinkTypesDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    const moduleLTContent = JSON.stringify({
      name: 'foo/linkTypes/is-caused-by',
      displayName: 'Is caused by',
      outboundDisplayName: 'is caused by',
      inboundDisplayName: 'causes',
      sourceCardTypes: [],
      destinationCardTypes: [],
      enableLinkDescription: false,
    });
    const moduleLTPath = join(moduleLinkTypesDir, 'is-caused-by.json');
    await writeFile(moduleLTPath, moduleLTContent);

    // Seed a LOCAL card with a link referencing the OLD foreign link type name.
    const cardIndexPath = join(projPath, 'cardRoot', 'decision_5', 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['links'] = [{ linkType: 'foo/linkTypes/blocks', cardKey: 'decision_6' }];
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay scenario) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'rename',
        target: resourceName('foo/linkTypes/blocks'),
        newIdentifier: 'is-caused-by',
      },
      { bypassFingerprint: true },
    );

    // Local card's link block was rewritten.
    await foreignProject.populateCaches();
    const updatedCard = foreignProject.findCard('decision_5');
    const links = updatedCard.metadata?.links ?? [];
    expect(links.some((l) => l.linkType === 'foo/linkTypes/blocks')).toBe(false);
    expect(links.some((l) => l.linkType === 'foo/linkTypes/is-caused-by')).toBe(true);

    // Module link-type file was NOT touched.
    const moduleFileBytes = await readFile(moduleLTPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleLTContent);
  });
});
