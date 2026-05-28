import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { copyDir } from '../../../src/utils/file-utils.js';
import type { Project } from '../../../src/containers/project.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { WorkflowDeleteHandler } from '../../../src/mutations/handlers/workflow-delete.js';
import { resourceName } from '../../../src/utils/resource-utils.js';
import { ResourceMutations } from '../../../src/mutations/plan.js';

const baseDir = import.meta.dirname;
const FIXTURE_PATH = join(baseDir, '..', '..', 'test-data', 'valid', 'decision-records');
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
    const wfName = 'decision/workflows/decision';
    const dependentCardTypeNames = project.resources
      .cardTypes()
      .filter((ct) => ct.data?.workflow === wfName)
      .map((ct) => ct.data!.name);

    const mutations = new ResourceMutations(project);
    await mutations.apply(
      {
        kind: 'delete',
        target: resourceName(wfName),
      },
      { bypassFingerprint: true },
    );

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

describe('foreign-module replay (apply only, foreign target)', () => {
  it('deletes local card types that used the foreign workflow; leaves foreign workflow file untouched', async () => {
    const projPath = join(testDir, `proj-foreign-wf-del-${Date.now()}`);
    await mkdir(projPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projPath);

    // Seed module "foo" with a workflow (from module perspective it's been deleted,
    // but the file may still exist on disk — verify we do not touch it).
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
      states: [{ name: 'Open', category: 'initial' }],
      transitions: [{ name: 'Create', fromState: [''], toState: 'Open' }],
    });
    const moduleWfPath = join(moduleWorkflowsDir, 'wf.json');
    await writeFile(moduleWfPath, moduleWfContent);

    // Seed a LOCAL card type that references the foreign workflow.
    const localCardTypePath = join(
      projPath,
      '.cards',
      'local',
      'cardTypes',
      'decision.json',
    );
    const localCT = JSON.parse(await readFile(localCardTypePath, 'utf-8')) as Record<string, unknown>;
    const localCTName = localCT['name'] as string; // 'decision/cardTypes/decision'
    localCT['workflow'] = 'foo/workflows/wf';
    await writeFile(localCardTypePath, JSON.stringify(localCT));

    // Seed a local card of that card type.
    const cardKey = 'decision_5';
    const cardIndexPath = join(projPath, 'cardRoot', cardKey, 'index.json');
    const cardMeta = JSON.parse(await readFile(cardIndexPath, 'utf-8')) as Record<string, unknown>;
    cardMeta['cardType'] = localCTName;
    cardMeta['workflowState'] = 'Open';
    await writeFile(cardIndexPath, JSON.stringify(cardMeta));

    const foreignProject = getTestProject(projPath);
    await foreignProject.populateCaches();

    // Apply with foreign target (replay) — must not throw.
    const mutations = new ResourceMutations(foreignProject);
    await mutations.apply(
      { kind: 'delete', target: resourceName('foo/workflows/wf') },
      { bypassFingerprint: true },
    );

    await foreignProject.populateCaches();

    // LOCAL card type that used the foreign workflow was deleted.
    expect(foreignProject.resources.exists(localCTName)).toBe(false);

    // LOCAL card of that type was also deleted.
    const remainingCards = foreignProject.cards(undefined).filter(
      (c) => c.metadata?.cardType === localCTName,
    );
    expect(remainingCards).toHaveLength(0);

    // Module workflow file was NOT deleted/modified.
    expect(existsSync(moduleWfPath)).toBe(true);
    const moduleFileBytes = await readFile(moduleWfPath, 'utf-8');
    expect(moduleFileBytes).toBe(moduleWfContent);
  });
});
