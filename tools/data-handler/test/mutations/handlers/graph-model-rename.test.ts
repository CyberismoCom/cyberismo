import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { GraphModelRenameHandler } from '../../../src/mutations/handlers/graph-model.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-graph-model-rename');

describe('GraphModelRenameHandler', () => {
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

  it('matches a graph-model rename input', () => {
    const handler = new GraphModelRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName('decision/graphModels/test'),
          newIdentifier: 'test-v2',
        },
      }),
    ).toBe(true);
  });

  it('declines a graph-model edit input', () => {
    const handler = new GraphModelRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/graphModels/test'),
          updateKey: { key: 'displayName' },
          operation: { name: 'change', target: 'A', to: 'B' },
        },
      }),
    ).toBe(false);
  });

  it('isBreaking is true', () => {
    expect(new GraphModelRenameHandler().isBreaking).toBe(true);
  });

  it('apply renames the graph-model resource', async () => {
    const oldName = 'decision/graphModels/test';
    const newName = 'decision/graphModels/test-v2';
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(oldName),
      newIdentifier: 'test-v2',
    });

    expect(project.resources.exists(oldName)).toBe(false);
    expect(project.resources.exists(newName)).toBe(true);
  });

  it('throws when the graph-model does not exist', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'rename',
        target: resourceName('decision/graphModels/does-not-exist'),
        newIdentifier: 'whatever',
      }),
    ).rejects.toThrow();
  });
});
