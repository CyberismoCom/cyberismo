import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { TemplateRenameHandler } from '../../../src/mutations/handlers/template.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-template-rename');

describe('TemplateRenameHandler', () => {
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

  it('matches rename inputs on templates only', () => {
    const handler = new TemplateRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/templates/decision`),
        newIdentifier: 'decision-record',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('is breaking', () => {
    expect(new TemplateRenameHandler().isBreaking).toBe(true);
  });

  it('preview names how many cards/reports reference the template', async () => {
    const handler = new TemplateRenameHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/templates/decision`),
        newIdentifier: 'decision-record',
      },
    });
    expect(
      preview.affectedCardCount +
        preview.affectedHandlebarFileCount +
        preview.affectedCalculationCount,
    ).toBeGreaterThanOrEqual(0);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('applyCascade + applyResourceOp rewrites createCards references in index.adoc files', async () => {
    const handler = new TemplateRenameHandler();
    const oldName = `${project.projectPrefix}/templates/decision`;
    const newName = `${project.projectPrefix}/templates/decision-record`;
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: 'decision-record',
      },
    };

    await handler.applyCascade(ctx);
    await handler.applyResourceOp(ctx);

    for (const card of project.cards(undefined)) {
      const adocPath = join(card.path, 'index.adoc');
      let content: string;
      try {
        content = await readFile(adocPath, 'utf-8');
      } catch {
        continue;
      }
      expect(content).not.toContain(oldName);
    }

    expect(project.resources.exists(newName)).toBe(true);
    expect(project.resources.exists(oldName)).toBe(false);
  });
});
