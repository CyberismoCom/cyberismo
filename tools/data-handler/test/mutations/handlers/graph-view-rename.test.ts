import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { GraphViewRenameHandler } from '../../../src/mutations/handlers/graph-view.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-graph-view-rename');

describe('GraphViewRenameHandler', () => {
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

  it('matches rename inputs on graphViews only', () => {
    const handler = new GraphViewRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName(`${project.projectPrefix}/graphViews/default`),
          newIdentifier: 'main',
        },
      }),
    ).toBe(true);
  });

  it('is breaking', () => {
    expect(new GraphViewRenameHandler().isBreaking).toBe(true);
  });

  it('applyCascade + applyResourceOp renames the resource', async () => {
    const views = project.resources.graphViews(/* localOnly */);
    if (views.length === 0) return;
    const view = views[0];
    const oldName = view.data!.name;
    const newIdent = `${view.resourceName.identifier}-renamed`;
    const handler = new GraphViewRenameHandler();
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
    expect(
      project.resources.byType(
        `${view.resourceName.prefix}/graphViews/${newIdent}`,
        'graphViews',
      ),
    ).toBeDefined();
  });
});
