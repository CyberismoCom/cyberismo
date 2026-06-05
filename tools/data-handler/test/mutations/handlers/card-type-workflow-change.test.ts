import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeWorkflowChangeHandler } from '../../../src/mutations/handlers/card-type-workflow-change.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-card-type-workflow');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;

const cardTypeName = () => `${project.projectPrefix}/cardTypes/decision`;
const fromWorkflow = () => `${project.projectPrefix}/workflows/decision`;
const toWorkflow = () => `${project.projectPrefix}/workflows/simple`;

describe('CardTypeWorkflowChangeHandler', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir(join(baseDir, '..', '..', 'test-data'), testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
  });
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('matches an edit of cardType.workflow', () => {
    const handler = new CardTypeWorkflowChangeHandler();
    const ctx = {
      project,
      input: {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
        },
      },
    };
    expect(handler.matches(ctx)).toBe(true);
    expect(handler.isBreaking).toBe(true);
  });

  it('rejects incomplete mappings the same way verifyStateMapping does', async () => {
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply({
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
          mappingTable: {
            stateMapping: { Draft: 'Created', Approved: 'Approved' },
          },
        },
      }),
    ).rejects.toThrow(/State mapping validation failed/);
  });

  it('applies the state mapping when provided', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(cardTypeName()),
      updateKey: { key: 'workflow' },
      operation: {
        name: 'change' as const,
        target: fromWorkflow(),
        to: toWorkflow(),
        mappingTable: {
          stateMapping: {
            Draft: 'Created',
            Approved: 'Approved',
            Rejected: 'Deprecated',
            Rerejected: 'Deprecated',
            Deprecated: 'Deprecated',
          },
        },
      },
    });
    const updated = project.resources
      .byType(cardTypeName(), 'cardTypes')
      .show();
    expect(updated.workflow).toBe(toWorkflow());
    for (const card of project.cards(undefined)) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(['Created', 'Approved', 'Deprecated']).toContain(
          card.metadata.workflowState,
        );
      }
    }
  });

  it('changes the workflow reference but leaves card states when no mapping is given', async () => {
    const before = new Map(
      project
        .cards(undefined)
        .filter((c) => c.metadata?.cardType === cardTypeName())
        .map((c) => [c.key, c.metadata!.workflowState]),
    );

    const mutations = new ResourceMutations(project);
    await mutations.apply({
      kind: 'edit' as const,
      target: resourceName(cardTypeName()),
      updateKey: { key: 'workflow' },
      operation: {
        name: 'change' as const,
        target: fromWorkflow(),
        to: toWorkflow(),
      },
    });

    const updated = project.resources
      .byType(cardTypeName(), 'cardTypes')
      .show();
    expect(updated.workflow).toBe(toWorkflow());
    // Legacy behavior: with no state mapping, card workflowState is untouched.
    for (const card of project.cards(undefined)) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(card.metadata.workflowState).toBe(before.get(card.key));
      }
    }
  });
});
