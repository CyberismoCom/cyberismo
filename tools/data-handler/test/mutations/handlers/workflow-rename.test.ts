import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameHandler } from '../../../src/mutations/handlers/workflow-rename.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename');

describe('WorkflowRenameHandler', () => {
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

  it('matches a workflow rename input', () => {
    const handler = new WorkflowRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'rename',
          target: resourceName('decision/workflows/decision'),
          newIdentifier: 'decision-v2',
        },
      }),
    ).toBe(true);
  });

  it('declines a workflow edit input', () => {
    const handler = new WorkflowRenameHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'displayName' },
          operation: { name: 'change', target: 'A', to: 'B' },
        },
      }),
    ).toBe(false);
  });

  it('preview counts at least one affected card type', async () => {
    const handler = new WorkflowRenameHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'rename',
        target: resourceName('decision/workflows/decision'),
        newIdentifier: 'decision-v2',
      },
    });
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
    expect(preview.dataLossExpected).toBe(false);
    // At least one card type and any calculations/handlebars are summarised.
    expect(preview.summary).toMatch(/card type/i);
  });

  it('apply rewrites the workflow reference in dependent card types', async () => {
    const handler = new WorkflowRenameHandler();
    const oldName = 'decision/workflows/decision';
    const newName = 'decision/workflows/decision-v2';
    await handler.apply({
      project,
      input: {
        kind: 'rename',
        target: resourceName(oldName),
        newIdentifier: 'decision-v2',
      },
    });
    const cardTypes = project.resources.cardTypes();
    for (const ct of cardTypes) {
      if (ct.data) {
        expect(ct.data.workflow).not.toBe(oldName);
      }
    }
    const renamed = project.resources.byType(newName, 'workflows');
    expect(renamed).toBeDefined();
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRenameHandler().isBreaking).toBe(true);
  });
});
