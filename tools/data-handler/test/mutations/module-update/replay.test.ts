import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { replayLog } from '../../../src/mutations/module-update/replay.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ProjectPaths } from '../../../src/containers/project/project-paths.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-replay');

describe('replayLog', () => {
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

  it('applies a single resource_rename entry', async () => {
    const folder = new ProjectPaths(projectPath).migrationLogFolder;
    await mkdir(folder, { recursive: true });
    const logPath = join(folder, 'migrationLog_1.6.0.jsonl');
    await writeFile(
      logPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        kind: 'resource_rename',
        target: `${project.projectPrefix}/linkTypes/test`,
        payload: {
          type: 'linkTypes',
          newName: `${project.projectPrefix}/linkTypes/test-renamed`,
        },
      }) + '\n',
    );

    const result = await replayLog(project, logPath);
    expect(result.status).toBe('succeeded');

    // Verify the resource was renamed (file should exist under new name).
    const newPath = join(
      projectPath,
      '.cards',
      'local',
      'linkTypes',
      'test-renamed.json',
    );
    await expect(stat(newPath)).resolves.not.toThrow();
  });

  it('returns failure on dispatcher error', async () => {
    const folder = new ProjectPaths(projectPath).migrationLogFolder;
    await mkdir(folder, { recursive: true });
    const logPath = join(folder, 'migrationLog_99.0.0.jsonl');
    await writeFile(
      logPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        kind: 'resource_rename',
        target: `${project.projectPrefix}/linkTypes/does-not-exist`,
        payload: { type: 'linkTypes', newName: 'foo' },
      }) + '\n',
    );

    const result = await replayLog(project, logPath);
    expect(result.status).toBe('failed');
    expect(result.failureSummary).toMatch(/does-not-exist|not found/i);
  });
});
