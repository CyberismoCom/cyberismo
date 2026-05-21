import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRemoveStateHandler } from '../../../src/mutations/handlers/workflow-remove-state.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-remove-state');

describe('WorkflowRemoveStateHandler', () => {
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

  it('matches remove on workflow states', () => {
    const handler = new WorkflowRemoveStateHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'states' },
          operation: {
            name: 'remove',
            target: { name: 'Rejected', category: 'closed' },
          },
        },
      }),
    ).toBe(true);
  });

  it('preview marks data loss when no replacementValue is supplied', async () => {
    const handler = new WorkflowRemoveStateHandler();
    const preview = await handler.preview({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
        },
      },
    });
    expect(preview.dataLossExpected).toBe(true);
  });

  it('apply moves cards in the removed state to the first remaining state', async () => {
    // Pre-condition: pick a card in the fixture currently in 'Rejected' (or
    // move one into it before applying). Use the existing project APIs to do
    // so without depending on a specific fixture layout.
    const allCards = project.cards(undefined);
    const target =
      allCards.find(
        (c) => c.metadata?.cardType === 'decision/cardTypes/decision',
      ) || allCards[0];
    if (target?.metadata) {
      target.metadata.workflowState = 'Rejected';
      await project.updateCardMetadata(target, target.metadata);
    }

    const handler = new WorkflowRemoveStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
        },
      },
    });
    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
    // The workflow's first remaining state. From the fixture, 'Draft' is
    // first; verify against the workflow file after removal.
    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    )!;
    expect(refetched.metadata?.workflowState).toBe(wf.data?.states[0].name);
  });

  it('apply with explicit replacementValue uses that state', async () => {
    const allCards = project.cards(undefined);
    const target =
      allCards.find(
        (c) => c.metadata?.cardType === 'decision/cardTypes/decision',
      ) || allCards[0];
    if (target?.metadata) {
      target.metadata.workflowState = 'Rejected';
      await project.updateCardMetadata(target, target.metadata);
    }

    const handler = new WorkflowRemoveStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
          replacementValue: { name: 'Approved', category: 'closed' },
        },
      },
    });
    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
    expect(refetched.metadata?.workflowState).toBe('Approved');
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRemoveStateHandler().isBreaking).toBe(true);
  });
});
