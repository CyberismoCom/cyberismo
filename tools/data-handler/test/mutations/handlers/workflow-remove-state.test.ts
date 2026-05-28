import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRemoveStateHandler } from '../../../src/mutations/handlers/workflow-remove-state.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { copyDir } from '../../../src/utils/file-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

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
    // Pre-condition: place a card in 'Rejected'.
    const allCards = project.cards(undefined);
    const target =
      allCards.find(
        (c) => c.metadata?.cardType === 'decision/cardTypes/decision',
      ) || allCards[0];
    if (target?.metadata) {
      target.metadata.workflowState = 'Rejected';
      await project.updateCardMetadata(target, target.metadata);
    }

    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
        },
      },
      { bypassFingerprint: true },
    );
    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
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

    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
          replacementValue: { name: 'Approved', category: 'closed' },
        },
      },
      { bypassFingerprint: true },
    );
    const refetched = project.cards(undefined).find((c) => c.key === target!.key)!;
    expect(refetched.metadata?.workflowState).toBe('Approved');
  });

  it('isBreaking is true', () => {
    expect(new WorkflowRemoveStateHandler().isBreaking).toBe(true);
  });
});

describe('foreign-module replay (apply only, foreign target)', () => {
  it('moves local cards out of removed state; leaves foreign workflow file untouched', async () => {
    const projPath = join(tmpDir, `proj-foreign-wf-rm-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a workflow that has "Rejected" already removed.
    const moduleDir = join(projPath, '.cards', 'modules', 'foo');
    const moduleWorkflowsDir = join(moduleDir, 'workflows');
    await mkdir(moduleWorkflowsDir, { recursive: true });
    await writeFile(
      join(moduleDir, 'cardsConfig.json'),
      JSON.stringify({ cardKeyPrefix: 'foo', name: 'foo', modules: [] }),
    );
    const moduleWfContent = JSON.stringify({
      name: 'foo/workflows/wf',
      displayName: 'Foo Workflow',
      states: [
        { name: 'Open', category: 'initial' },
        { name: 'Approved', category: 'closed' },
      ],
      transitions: [{ name: 'Create', fromState: [''], toState: 'Open' }],
    });
    const moduleWfPath = join(moduleWorkflowsDir, 'wf.json');
    await writeFile(moduleWfPath, moduleWfContent);

    // Seed local card type pointing at foreign workflow.
    const localCardTypePath = join(
      projPath,
      '.cards',
      'local',
      'cardTypes',
      'decision.json',
    );
    const localCT = JSON.parse(await readFile(localCardTypePath, 'utf-8')) as Record<string, unknown>;
    localCT['workflow'] = 'foo/workflows/wf';
    await writeFile(localCardTypePath, JSON.stringify(localCT));

    // Seed local card in the (now-removed) "Rejected" state.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = 'decision/cardTypes/decision';
    cardMeta['workflowState'] = 'Rejected';
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    const foreignProject = new Project(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay).
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('foo/workflows/wf'),
        updateKey: { key: 'states' },
        operation: {
          name: 'remove',
          target: { name: 'Rejected', category: 'closed' },
          replacementValue: { name: 'Approved', category: 'closed' },
        },
      },
      { bypassFingerprint: true },
    );

    // Local card moved to replacement state.
    await foreignProject.populateCaches();
    const updatedCard = foreignProject.cards(undefined).find((c) => c.key === cardKey);
    expect(updatedCard?.metadata?.workflowState).toBe('Approved');

    // Module workflow file is byte-equal to seed.
    const moduleFileBytes = await readFile(moduleWfPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleWfContent);
  });
});
