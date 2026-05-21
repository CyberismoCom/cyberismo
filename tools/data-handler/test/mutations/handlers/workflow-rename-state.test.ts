import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameStateHandler } from '../../../src/mutations/handlers/workflow-rename-state.js';
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
const tmpDir = join(import.meta.dirname, 'tmp-workflow-rename-state');

describe('WorkflowRenameStateHandler', () => {
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

  it('matches a state rename', () => {
    const handler = new WorkflowRenameStateHandler();
    expect(
      handler.matches({
        project,
        input: {
          kind: 'edit',
          target: resourceName('decision/workflows/decision'),
          updateKey: { key: 'states' },
          operation: {
            name: 'change',
            target: { name: 'Draft', category: 'initial' },
            to: { name: 'DraftNew', category: 'initial' },
          },
        },
      }),
    ).toBe(true);
  });

  it('apply rewrites workflowState on affected cards and transitions', async () => {
    // Set up: place a card in 'Draft'.
    const allCards = project.cards(undefined);
    const target =
      allCards.find(
        (c) => c.metadata?.cardType === 'decision/cardTypes/decision',
      ) || allCards[0];
    if (target?.metadata) {
      target.metadata.workflowState = 'Draft';
      await project.updateCardMetadata(target, target.metadata);
    }

    const handler = new WorkflowRenameStateHandler();
    await handler.apply({
      project,
      input: {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'change',
          target: { name: 'Draft', category: 'initial' },
          to: { name: 'DraftNew', category: 'initial' },
        },
      },
    });

    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
    expect(refetched.metadata?.workflowState).toBe('DraftNew');

    const wf = project.resources.byType(
      'decision/workflows/decision',
      'workflows',
    )!;
    for (const t of wf.data!.transitions) {
      expect(t.toState).not.toBe('Draft');
      expect(t.fromState).not.toContain('Draft');
    }
    expect(wf.data!.states.map((s) => s.name)).toContain('DraftNew');
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRenameStateHandler().isBreaking).toBe(true);
  });
});
