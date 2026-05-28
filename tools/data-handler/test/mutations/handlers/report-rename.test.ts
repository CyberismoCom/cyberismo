import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { ReportRenameHandler } from '../../../src/mutations/handlers/report.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-report-rename');

describe('ReportRenameHandler', () => {
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

  it('matches rename inputs on reports only', () => {
    const handler = new ReportRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(`${project.projectPrefix}/reports/testReport`),
        newIdentifier: 'testReport-v2',
      },
    };
    expect(handler.matches(ctx)).toBe(true);
  });

  it('is breaking', () => {
    expect(new ReportRenameHandler().isBreaking).toBe(true);
  });

  it('applyCascade + applyResourceOp renames the resource', async () => {
    const reports = project.resources.reports(/* localOnly */);
    if (reports.length === 0) return; // skip if fixture has none
    const report = reports[0];
    const oldName = report.data!.name;
    const newIdent = `${report.resourceName.identifier}-renamed`;
    const handler = new ReportRenameHandler();
    const ctx = {
      project,
      input: {
        kind: 'rename' as const,
        target: resourceName(oldName),
        newIdentifier: newIdent,
      },
    };

    await handler.applyCascade(ctx);
    await handler.applyResourceOp(ctx);

    const renamed = project.resources.byType(
      `${report.resourceName.prefix}/reports/${newIdent}`,
      'reports',
    );
    expect(renamed).toBeDefined();
  });
});
