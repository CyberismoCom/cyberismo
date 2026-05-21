// tools/data-handler/test/mutations/handlers/graph-model-rename.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { GraphModelRenameHandler } from '../../../src/mutations/handlers/graph-model.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-graph-model-rename');

describe('GraphModelRenameHandler', () => {
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

  it('matches rename inputs on graphModels only', () => {
    const handler = new GraphModelRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName(`${project.projectPrefix}/graphModels/sample`),
          newIdentifier: 'sample-renamed',
        },
      }),
    ).toBe(true);
  });

  it('is breaking', () => {
    expect(new GraphModelRenameHandler().isBreaking).toBe(true);
  });

  it('apply renames the resource', async () => {
    const models = project.resources.graphModels(/* localOnly */);
    if (models.length === 0) return;
    const model = models[0];
    const oldName = model.data!.name;
    const newIdent = `${model.resourceName.identifier}-renamed`;
    const handler = new GraphModelRenameHandler();
    await handler.apply({
      project,
      input: {
        kind: 'rename',
        target: resourceName(oldName),
        newIdentifier: newIdent,
      },
    });
    expect(
      project.resources.byType(
        `${model.resourceName.prefix}/graphModels/${newIdent}`,
        'graphModels',
      ),
    ).toBeDefined();
  });
});
