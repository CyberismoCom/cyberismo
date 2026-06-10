import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../src/utils/file-utils.js';
import type { Project } from '../../src/containers/project.js';
import { getTestProject } from '../helpers/test-utils.js';
import { ResourceMutations } from '../../src/mutations/resource-mutations.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { resourceName } from '../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-workflow-integration');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

const WF = 'decision/workflows/decision';

describe('Workflow mutation engine end-to-end', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('apply → log entry for a workflow rename, dependent card types rewritten', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'rename',
      target: resourceName(WF),
      newIdentifier: 'decision-v2',
    });

    const newName = 'decision/workflows/decision-v2';
    expect(project.resources.exists(newName)).toBe(true);
    const decisionCt = project.resources
      .byType('decision/cardTypes/decision', 'cardTypes')
      .show();
    expect(decisionCt!.workflow).toBe(newName);

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some((e) => e.kind === 'resource_rename' && e.target === WF),
    ).toBe(true);
  });

  it('apply → breaking state removal records a log entry', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'remove',
        target: { name: 'Rejected', category: 'closed' },
      },
    });

    const wf = project.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).not.toContain('Rejected');

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.kind === 'resource_edit' &&
          e.target === WF &&
          (e.payload as { key?: string }).key === 'states',
      ),
    ).toBe(true);
  });

  it('apply → breaking state rename records a log entry', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'change',
        target: { name: 'Rejected', category: 'closed' },
        to: { name: 'Declined', category: 'closed' },
      },
    });

    const wf = project.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).toContain('Declined');

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.kind === 'resource_edit' &&
          e.target === WF &&
          (e.payload as { key?: string }).key === 'states',
      ),
    ).toBe(true);
  });

  it('apply → non-breaking add state records NO log entry', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'states' },
      operation: {
        name: 'add',
        target: { name: 'Archived', category: 'closed' },
      },
    });

    const wf = project.resources.byType(WF, 'workflows')!;
    expect(wf.data!.states.map((s) => s.name)).toContain('Archived');

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });

  it('apply → non-breaking transition change records NO log entry', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'transitions' },
      operation: { name: 'remove', target: 'Deprecate' },
    });

    const wf = project.resources.byType(WF, 'workflows')!;
    expect(wf.data!.transitions.map((t) => t.name)).not.toContain('Deprecate');

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });

  it('display-only changes fall through to DefaultNoCascadeHandler (no log entry)', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit',
      target: resourceName(WF),
      updateKey: { key: 'displayName' },
      operation: {
        name: 'change',
        target: 'Decision based workflow',
        to: 'Decision workflow',
      },
    });

    const wf = project.resources.byType(WF, 'workflows')!;
    expect(wf.data!.displayName).toBe('Decision workflow');

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });

  it('apply → deleting an in-use workflow is refused (no log entry)', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({ kind: 'delete', target: resourceName(WF) }),
    ).rejects.toThrow();

    expect(project.resources.exists(WF)).toBe(true);
    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(entries).toHaveLength(0);
  });
});
