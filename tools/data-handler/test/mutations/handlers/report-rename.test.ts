import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ReportRenameHandler } from '../../../src/mutations/handlers/report.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-report-rename');

describe('ReportRenameHandler', () => {
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

  it('matches a report rename input', () => {
    const handler = new ReportRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName('decision/reports/testReport'),
          newIdentifier: 'testReportV2',
        },
      }),
    ).toBe(true);
  });

  it('declines a report edit input', () => {
    const handler = new ReportRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/reports/testReport'),
          updateKey: { key: 'displayName' },
          operation: { name: 'change', target: 'A', to: 'B' },
        },
      }),
    ).toBe(false);
  });

  it('isBreaking is true', () => {
    expect(new ReportRenameHandler().isBreaking).toBe(true);
  });

  it('apply renames the report and rewrites card content references', async () => {
    const oldName = 'decision/reports/testReport';
    const newName = 'decision/reports/testReportV2';
    const cardContentPath = join(
      project.paths.cardRootFolder,
      'decision_5',
      'index.adoc',
    );
    // Sanity: the fixture card references the old report name to start with.
    expect(await readFile(cardContentPath, 'utf-8')).toContain(oldName);

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(oldName),
      newIdentifier: 'testReportV2',
    });

    expect(project.resources.exists(oldName)).toBe(false);
    expect(project.resources.exists(newName)).toBe(true);

    // The cascade in ReportResource.rename rewrote the card content reference.
    const after = await readFile(cardContentPath, 'utf-8');
    expect(after).toContain(newName);
    expect(after).not.toContain(`"${oldName}"`);
  });

  it('throws when the report does not exist', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'rename',
        target: resourceName('decision/reports/does-not-exist'),
        newIdentifier: 'whatever',
      }),
    ).rejects.toThrow();
  });
});
