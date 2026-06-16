import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-transition');

describe('workflow transitions routing and cascade', () => {
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

  it('apply add appends the transition to the workflow definition', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName('decision/workflows/decision'),
      updateKey: { key: 'transitions' },
      operation: {
        name: 'add',
        target: {
          name: 'Archive',
          fromState: ['Approved'],
          toState: 'Deprecated',
        },
      },
    });
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.transitions.map((t) => t.name)).toContain('Archive');
  });

  it('apply remove drops the transition from the workflow definition', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName('decision/workflows/decision'),
      updateKey: { key: 'transitions' },
      operation: { name: 'remove', target: 'Deprecate' },
    });
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    );
    expect(wf?.data?.transitions.map((t) => t.name)).not.toContain('Deprecate');
  });
});
