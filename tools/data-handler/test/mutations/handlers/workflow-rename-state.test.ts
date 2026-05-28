import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../../src/containers/project.js';
import { WorkflowRenameStateHandler } from '../../../src/mutations/handlers/workflow-rename-state.js';
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

    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'edit',
        target: resourceName('decision/workflows/decision'),
        updateKey: { key: 'states' },
        operation: {
          name: 'change',
          target: { name: 'Draft', category: 'initial' },
          to: { name: 'DraftNew', category: 'initial' },
        },
      },
      { bypassFingerprint: true },
    );

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

describe('foreign-module replay (apply only, foreign target)', () => {
  it('rewrites local card workflowState; leaves foreign workflow file untouched', async () => {
    const projPath = join(tmpDir, `proj-foreign-wf-rs-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a workflow (already has state renamed to "Open-v2").
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
      states: [{ name: 'Open-v2', category: 'initial' }],
      transitions: [{ name: 'Create', fromState: [''], toState: 'Open-v2' }],
    });
    const moduleWfPath = join(moduleWorkflowsDir, 'wf.json');
    await writeFile(moduleWfPath, moduleWfContent);

    // Seed local card type pointing at the foreign workflow.
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

    // Seed a local card in the OLD state (Open) using the foreign card type name.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = 'decision/cardTypes/decision';
    cardMeta['workflowState'] = 'Open';
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
          name: 'change',
          target: { name: 'Open', category: 'initial' },
          to: { name: 'Open-v2', category: 'initial' },
        },
      },
      { bypassFingerprint: true },
    );

    // Local card's workflowState was updated.
    await foreignProject.populateCaches();
    const updatedCard = foreignProject.cards(undefined).find((c) => c.key === cardKey);
    expect(updatedCard?.metadata?.workflowState).toBe('Open-v2');

    // Module workflow file is byte-equal to seed.
    const moduleFileBytes = await readFile(moduleWfPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleWfContent);
  });
});
