import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { WorkflowDeleteHandler } from '../../../src/mutations/handlers/workflow-delete.js';
import { resourceName } from '../../../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-workflow-delete');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

describe('WorkflowDeleteHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches a workflow delete', () => {
    expect(
      new WorkflowDeleteHandler().matches({
        project,
        input: {
          kind: 'delete',
          target: resourceName('decision/workflows/decision'),
        },
      }),
    ).toBe(true);
  });

  it('preview reports both card-type and card counts and data loss', async () => {
    const preview = await new WorkflowDeleteHandler().preview({
      project,
      input: {
        kind: 'delete',
        target: resourceName('decision/workflows/decision'),
      },
    });
    expect(preview.affectedCardCount).toBeGreaterThanOrEqual(0);
    expect(preview.dataLossExpected).toBe(true);
    expect(preview.summary).toMatch(/card type/i);
    expect(preview.summary).toMatch(/will be deleted/i);
  });

  it('apply deletes cards, then card types, then the workflow (ordering)', async () => {
    const handler = new WorkflowDeleteHandler();
    const wfName = 'decision/workflows/decision';
    const dependentCardTypeNames = project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName)
      .map((ct) => ct.data!.name);

    await handler.apply({
      project,
      input: {
        kind: 'delete',
        target: resourceName(wfName),
      },
    });

    await project.populateCaches();

    // Workflow gone.
    expect(project.resources.exists(wfName)).toBe(false);
    // Dependent card types gone.
    for (const ctName of dependentCardTypeNames) {
      expect(project.resources.exists(ctName)).toBe(false);
    }
    // No card of those types remains.
    const remaining = project.cards(undefined).filter((c) =>
      dependentCardTypeNames.includes(c.metadata?.cardType ?? ''),
    );
    expect(remaining).toHaveLength(0);
  });

  it('isBreaking is true', () => {
    expect(new WorkflowDeleteHandler().isBreaking).toBe(true);
  });
});
