import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { copyDir } from '../../src/utils/file-utils.js';
import { renameProjectPrefix } from '../../src/utils/prefix-rename.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-project-rename');

describe('renameProjectPrefix', () => {
  let project: Project;

  beforeEach(async () => {
    const projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('apply rewrites cardType references in every card', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    await renameProjectPrefix(project, newPrefix);

    expect(project.projectPrefix).toBe(newPrefix);

    for (const card of project.cardTree.cards()) {
      // Cards that referenced cardTypes under oldPrefix must now reference newPrefix.
      if (card.metadata?.cardType?.startsWith(`${oldPrefix}/`)) {
        expect.fail(`card '${card.key}' still references old prefix`);
      }
    }
  });

  it('apply rewrites resource references in card content adoc files', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    await renameProjectPrefix(project, newPrefix);

    for (const card of project.cardTree.cards()) {
      const adoc = join(card.path, 'index.adoc');
      let content: string;
      try {
        content = await readFile(adoc, 'utf-8');
      } catch {
        continue;
      }
      // No remaining "<oldPrefix>/<resourceType>/" substring (the strict
      // cascade pattern that updateFiles uses).
      for (const type of [
        'calculations',
        'cardTypes',
        'fieldTypes',
        'linkTypes',
        'reports',
        'templates',
        'workflows',
      ]) {
        expect(content).not.toContain(`${oldPrefix}/${type}/`);
      }
    }
  });

  it('apply rewrites internal references of card types and link types', async () => {
    const newPrefix = 'renamed';
    await renameProjectPrefix(project, newPrefix);

    const cardType = project.resources
      .byType(`${newPrefix}/cardTypes/decision`, 'cardTypes')
      .show();
    expect(cardType.workflow).toBe(`${newPrefix}/workflows/decision`);
    for (const field of cardType.customFields) {
      expect(field.name.startsWith(`${newPrefix}/fieldTypes/`)).toBe(true);
    }

    const linkType = project.resources
      .byType(`${newPrefix}/linkTypes/testTypes`, 'linkTypes')
      .show();
    expect(linkType.sourceCardTypes).toEqual([
      `${newPrefix}/cardTypes/decision`,
    ]);
    expect(linkType.destinationCardTypes).toEqual([
      `${newPrefix}/cardTypes/simplepage`,
    ]);
  });

  it('apply renames cards whose key starts with the old prefix', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    await renameProjectPrefix(project, newPrefix);

    for (const card of project.cardTree.cards()) {
      expect(card.key.startsWith(`${oldPrefix}_`)).toBe(false);
    }
  });

  it('throws when renaming to the current prefix', async () => {
    const current = project.projectPrefix;
    await expect(renameProjectPrefix(project, current)).rejects.toThrow(
      `Project prefix is already '${current}'`,
    );
  });

  it('throws for an invalid prefix', async () => {
    // Underscore is not a valid prefix character (setCardPrefix rejects it).
    await expect(renameProjectPrefix(project, 'bad_prefix')).rejects.toThrow();
  });
});
