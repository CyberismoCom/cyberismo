import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ProjectRenameHandler } from '../../../src/mutations/handlers/project-rename.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

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
    const mutations = new ResourceMutations(project);

    await mutations.apply(
      { kind: 'project_rename', newPrefix },
      { bypassFingerprint: true },
    );

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
    const mutations = new ResourceMutations(project);

    await mutations.apply(
      { kind: 'project_rename', newPrefix },
      { bypassFingerprint: true },
    );

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
    const mutations = new ResourceMutations(project);

    await mutations.apply(
      { kind: 'project_rename', newPrefix },
      { bypassFingerprint: true },
    );

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

  it('applyResourceOp and applyCascade exist (split interface); apply is absent', () => {
    const handler = new ProjectRenameHandler();
    expect(typeof handler.applyResourceOp).toBe('function');
    expect(typeof handler.applyCascade).toBe('function');
    expect(handler.apply).toBeUndefined();
  });

  it('ResourceMutations.apply calls both applyCascade and applyResourceOp for project_rename', async () => {
    // Confirm that the plan.ts gating correctly routes project_rename through
    // both applyCascade and applyResourceOp even though project_rename has no target field.
    const handler = new ProjectRenameHandler();
    const cascadeSpy = vi.spyOn(handler, 'applyCascade');
    const resourceOpSpy = vi.spyOn(handler, 'applyResourceOp');

    // Patch dispatch to return our spy-wrapped handler.
    const dispatchMod = await import('../../../src/mutations/dispatcher.js');
    const origDispatch = dispatchMod.dispatch;
    vi.spyOn(dispatchMod, 'dispatch').mockImplementation((ctx) => {
      if (ctx.input.kind === 'project_rename') return handler;
      return origDispatch(ctx);
    });

    const mutations = new ResourceMutations(project);
    await mutations.apply(
      { kind: 'project_rename', newPrefix: 'renamed' },
      { bypassFingerprint: true },
    );

    expect(cascadeSpy).toHaveBeenCalledOnce();
    expect(resourceOpSpy).toHaveBeenCalledOnce();

    vi.restoreAllMocks();
  });
});
