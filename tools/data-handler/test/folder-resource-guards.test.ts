import { expect, describe, it, beforeAll, afterAll } from 'vitest';

import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import { ReportResource } from '../src/resources/report-resource.js';
import { resourceName } from '../src/utils/resource-utils.js';

import type { Project } from '../src/containers/project.js';

// Folder resources turn their identifier into a folder name. These tests make
// sure that file system operations stay inside the resource's own folder.
describe('folder resource guards', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-folder-resource-guards-tests');
  const projectPath = join(testDir, 'valid/decision-records');
  const localFolder = join(projectPath, '.cards/local');
  const reportsFolder = join(localFolder, 'reports');
  let project: Project;

  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = getTestProject(projectPath);
    await project.populateCaches();
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it.each(['.', '..', '.hidden'])(
    "refuses to create a resource with identifier '%s'",
    async (identifier) => {
      const report = new ReportResource(
        project,
        resourceName(`decision/reports/${identifier}`),
      );
      await expect(report.create()).rejects.toThrow(
        `Identifier '${identifier}' is invalid`,
      );
      expect(existsSync(join(reportsFolder, `${identifier}.json`))).toBe(false);
    },
  );

  it.each(['.', '..'])(
    "refuses to delete the folder of a resource with identifier '%s'",
    async (identifier) => {
      const report = new ReportResource(
        project,
        resourceName(`decision/reports/${identifier}`),
      );
      await expect(report.delete()).rejects.toThrow(
        `Resource identifier '${identifier}' is not a valid folder name`,
      );
      expect(existsSync(reportsFolder)).toBe(true);
      expect(existsSync(localFolder)).toBe(true);
    },
  );

  it("refuses to update a file of a resource with identifier '..'", async () => {
    const report = new ReportResource(
      project,
      resourceName('decision/reports/..'),
    );
    await expect(
      report.updateFile('index.adoc.hbs', 'content'),
    ).rejects.toThrow("Resource identifier '..' is not a valid folder name");
    expect(existsSync(join(localFolder, 'index.adoc.hbs'))).toBe(false);
  });

  describe('updateFile', () => {
    const reportName = 'decision/reports/testReport';

    it.each([
      join('..', 'anotherReport', 'index.adoc.hbs'),
      join('..', '..', 'cardsConfig.json'),
      join('sub', 'index.adoc.hbs'),
      `.${'/'}index.adoc.hbs`,
    ])("refuses file '%s' that is not in the resource", async (fileName) => {
      const report = project.resources.byType(reportName, 'reports');
      await expect(report.updateFile(fileName, 'changed')).rejects.toThrow(
        'is not in the resource',
      );
    });

    it('refuses a file that is not in the allow-list', async () => {
      const report = project.resources.byType(reportName, 'reports');
      await expect(report.updateFile('script.sh', 'changed')).rejects.toThrow(
        "File 'script.sh' is not allowed to be updated",
      );
      expect(existsSync(join(reportsFolder, 'testReport', 'script.sh'))).toBe(
        false,
      );
    });
  });
});
