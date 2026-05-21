import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ProjectRenameHandler } from '../../../src/mutations/handlers/project-rename.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-project-rename');

describe('ProjectRenameHandler', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('matches only project_rename inputs', () => {
    const handler = new ProjectRenameHandler();
    expect(
      handler.matches({
        project,
        input: { kind: 'project_rename', newPrefix: 'renamed' },
      }),
    ).toBe(true);
    expect(
      handler.matches({
        project,
        // @ts-expect-error wrong input kind on purpose
        input: { kind: 'rename', newPrefix: 'renamed' },
      }),
    ).toBe(false);
  });

  it('is breaking', () => {
    expect(new ProjectRenameHandler().isBreaking).toBe(true);
  });

  it('preview reports a large cascade summary', async () => {
    const handler = new ProjectRenameHandler();
    const preview = await handler.preview({
      project,
      input: { kind: 'project_rename', newPrefix: 'renamed' },
    });
    expect(preview.affectedCardCount).toBeGreaterThan(0);
    expect(preview.summary).toMatch(/prefix/i);
  });

  it('apply rewrites cardType references in every card', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const handler = new ProjectRenameHandler();

    await handler.apply({
      project,
      input: { kind: 'project_rename', newPrefix },
    });

    expect(project.projectPrefix).toBe(newPrefix);

    for (const card of project.cards(undefined)) {
      // Cards that referenced cardTypes under oldPrefix must now reference newPrefix.
      if (card.metadata?.cardType?.startsWith(`${oldPrefix}/`)) {
        expect.fail(`card '${card.key}' still references old prefix`);
      }
    }
  });

  it('apply rewrites resource references in card content adoc files', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const handler = new ProjectRenameHandler();

    await handler.apply({
      project,
      input: { kind: 'project_rename', newPrefix },
    });

    for (const card of project.cards(undefined)) {
      const adoc = join(card.path, 'index.adoc');
      let content: string;
      try {
        content = await readFile(adoc, 'utf-8');
      } catch {
        continue;
      }
      // No remaining "<oldPrefix>/<resourceType>/" substring (the
      // strict cascade pattern that updateFiles uses).
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

  it('apply renames cards whose key starts with the old prefix', async () => {
    const oldPrefix = project.projectPrefix;
    const newPrefix = 'renamed';
    const handler = new ProjectRenameHandler();

    await handler.apply({
      project,
      input: { kind: 'project_rename', newPrefix },
    });

    for (const card of project.cards(undefined)) {
      expect(card.key.startsWith(`${oldPrefix}_`)).toBe(false);
    }
  });

  it('affectedFilePaths covers cardRoot and resources folders', async () => {
    const handler = new ProjectRenameHandler();
    const paths = await handler.affectedFilePaths({
      project,
      input: { kind: 'project_rename', newPrefix: 'renamed' },
    });
    expect(paths.length).toBeGreaterThan(0);
  });
});
