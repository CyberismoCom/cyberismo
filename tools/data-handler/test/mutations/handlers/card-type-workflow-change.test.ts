import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardTypeWorkflowChangeHandler } from '../../../src/mutations/handlers/card-type-workflow-change.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

const baseDir = import.meta.dirname;
const FIXTURE_PATH = join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records');
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

  it('preview reports data loss when no mapping is provided', async () => {
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
    const preview = await handler.preview(ctx);
    expect(preview.affectedCardCount).toBeGreaterThan(0);
    expect(preview.dataLossExpected).toBe(true);
  });

  it('preview reports no data loss when full mapping is provided', async () => {
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
      },
    };
    const preview = await handler.preview(ctx);
    expect(preview.dataLossExpected).toBe(false);
  });

  it('rejects incomplete mappings the same way verifyStateMapping does', async () => {
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
          mappingTable: {
            stateMapping: { Draft: 'Created', Approved: 'Approved' },
          },
        },
      },
    };
    // verifyStateMapping is now in applyCascade, which plan.ts calls via apply().
    const mutations = new ResourceMutations(project);
    await expect(
      mutations.apply(
        {
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
        },
        { bypassFingerprint: true },
      )
    ).rejects.toThrow(/State mapping validation failed/);
  });

  it('applies mapping when provided', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
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
      },
      { bypassFingerprint: true },
    );
    const updated = project.resources.byType(cardTypeName(), 'cardTypes').show();
    expect(updated.workflow).toBe(toWorkflow());
    for (const card of project.cards(undefined)) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(['Created', 'Approved', 'Deprecated']).toContain(
          card.metadata.workflowState,
        );
      }
    }
  });

  it('defaults every affected card to the first state of the new workflow when no mapping is given', async () => {
    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit' as const,
        target: resourceName(cardTypeName()),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change' as const,
          target: fromWorkflow(),
          to: toWorkflow(),
        },
      },
      { bypassFingerprint: true },
    );
    const newWorkflow = project.resources
      .byType(toWorkflow(), 'workflows')
      .show();
    const firstState = newWorkflow!.states[0].name;
    for (const card of project.cards(undefined)) {
      if (card.metadata?.cardType === cardTypeName()) {
        expect(card.metadata.workflowState).toBe(firstState);
      }
    }
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('resets workflowState on local cards of foreign card type; leaves module card-type file untouched', async () => {
    const projPath = join(testDir, `proj-foreign-wf-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a card type (already using new workflow — post-op state).
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleCardTypesDir = join(moduleDir, 'cardTypes');
    const moduleWorkflowsDir = join(moduleDir, 'workflows');
    await mkdir(moduleCardTypesDir, { recursive: true });
    await mkdir(moduleWorkflowsDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    // Old workflow
    await writeFile(
      join(moduleWorkflowsDir, 'oldwf.json'),
      JSON.stringify({
        name: 'foo/workflows/oldwf',
        displayName: 'Old workflow',
        states: [{ name: 'Draft', category: 'initial' }, { name: 'Done', category: 'closed' }],
        transitions: [{ name: 'Create', fromState: [], toState: 'Draft' }],
      }),
    );
    // New workflow (already installed)
    await writeFile(
      join(moduleWorkflowsDir, 'newwf.json'),
      JSON.stringify({
        name: 'foo/workflows/newwf',
        displayName: 'New workflow',
        states: [{ name: 'Open', category: 'initial' }, { name: 'Closed', category: 'closed' }],
        transitions: [{ name: 'Create', fromState: [], toState: 'Open' }],
      }),
    );
    // Module card type already referencing the new workflow.
    const moduleCTPath = join(moduleCardTypesDir, 'task.json');
    const moduleCTContent = JSON.stringify({
      name: 'foo/cardTypes/task',
      displayName: 'Task',
      workflow: 'foo/workflows/newwf',
      customFields: [],
      alwaysVisibleFields: [],
      optionallyVisibleFields: [],
    });
    await writeFile(moduleCTPath, moduleCTContent);

    // Seed a local card that uses the foreign card type with OLD workflow state.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = 'foo/cardTypes/task';
    cardMeta['workflowState'] = 'Draft';
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('foo/cardTypes/task'),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change',
          target: 'foo/workflows/oldwf',
          to: 'foo/workflows/newwf',
        },
      },
      { bypassFingerprint: true },
    );

    // Local card's workflowState was reset to the new workflow's first state.
    const updatedCard = foreignProject.findCard(cardKey);
    expect(updatedCard.metadata?.workflowState).toBe('Open');

    // Module card-type file was NOT modified.
    const moduleFileBytes = await readFile(moduleCTPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleCTContent);
  });
});
