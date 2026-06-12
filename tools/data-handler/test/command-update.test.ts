import { expect, it, describe, beforeEach, afterEach } from 'vitest';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import type { CardType } from '../src/interfaces/resource-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import type { Project } from '../src/containers/project.js';
import { Fetch, Show, Update } from '../src/commands/index.js';
import { getTestProject } from './helpers/test-utils.js';
import { resourceName } from '../src/utils/resource-utils.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-update-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;
let update: Update;

describe('update command', () => {
  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
    project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    update = new Update(project);
  });

  it('update file resource (rename via change on name)', async () => {
    const name = `${project.projectPrefix}/workflows/decision`;
    const exists = project.resources.exists(name);
    const newName = `${project.projectPrefix}/workflows/newName`;
    expect(exists).toBe(true);

    // A 'change' on 'name' is normalized to a rename by the mutation engine.
    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'name' },
      operation: { name: 'change', target: undefined, to: newName },
    });
    const workflows = project.resources.workflows();

    expect(workflows.at(0)!.data!.name).not.toBe(newName);
    expect(workflows.at(1)!.data!.name).toBe(newName);
  });
  it('update file resource (rename directly)', async () => {
    const name = `${project.projectPrefix}/workflows/decision`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.apply({
      kind: 'rename',
      target: resourceName(name),
      newIdentifier: 'newName',
    });
    const newName = `${project.projectPrefix}/workflows/newName`;

    expect(project.resources.exists(newName)).toBe(true);
    expect(project.resources.exists(name)).toBe(false);
  });
  it('update resource - rank item using string value (name)', async () => {
    const fetch = new Fetch(project);
    const show = new Show(project, fetch);
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const moveToIndex = 0;

    const before = await show.showResource(name);
    const foundBefore = (before as CardType).customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    const indexBefore = (before as CardType).customFields.indexOf(foundBefore!);

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'customFields' },
      operation: {
        name: 'rank',
        target: 'decision/fieldTypes/finished',
        newIndex: moveToIndex,
      },
    });

    const after = await show.showResource(name);
    const foundAfter = (after as CardType).customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    const indexAfter = (after as CardType).customFields.indexOf(foundAfter!);

    expect(indexBefore).not.toBe(indexAfter);
    expect(indexAfter).toBe(moveToIndex);
  });
  it('update resource - rank item using partial object value', async () => {
    const fetch = new Fetch(project);
    const show = new Show(project, fetch);
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const moveToIndex = 4;

    const before = (await show.showResource(name)) as CardType;
    const foundBefore = before.customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    })!;
    const indexBefore = before.customFields.indexOf(foundBefore);

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'customFields' },
      operation: {
        name: 'rank',
        target: { name: 'decision/fieldTypes/finished' },
        newIndex: moveToIndex,
      },
    });

    const after = (await show.showResource(name)) as CardType;
    const foundAfter = after.customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    })!;
    const indexAfter = after.customFields.indexOf(foundAfter);
    expect(indexBefore).not.toBe(indexAfter);
    expect(indexAfter).toBe(moveToIndex);
  });

  it('try to update file resource with invalid data', async () => {
    const name = `${project.projectPrefix}/workflows/simple`;
    const exists = project.resources.exists(name);
    const invalidName = `${project.projectPrefix}/workflows/newName-ÄÄÄ`;
    expect(exists).to.equal(true);

    await expect(
      update.apply({
        kind: 'edit',
        target: resourceName(name),
        updateKey: { key: 'name' },
        operation: { name: 'change', target: undefined, to: invalidName },
      }),
    ).rejects.toThrow(
      "Resource identifier must follow naming rules. Identifier 'newName-ÄÄÄ' is invalid",
    );
  });

  it('update card type workflow with complete state mapping (success)', async () => {
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
    const newWorkflow = `${project.projectPrefix}/workflows/simple`;

    // current workflow (decision) states: Draft, Approved, Rejected, Rerejected, Deprecated
    // new workflow (simple) states: Created, Approved, Deprecated
    const stateMap = {
      stateMapping: {
        Draft: 'Created',
        Approved: 'Approved',
        Rejected: 'Deprecated',
        Rerejected: 'Deprecated',
        Deprecated: 'Deprecated',
      },
    };

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'workflow' },
      operation: {
        name: 'change',
        target: currentWorkflow,
        to: newWorkflow,
        mappingTable: stateMap,
      },
    });

    const cardType = project.resources.byType(name, 'cardTypes').show();
    expect(cardType!.workflow).toBe(newWorkflow);
  });

  it('try to update card type workflow with incomplete state mapping (failure)', async () => {
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
    const newWorkflow = `${project.projectPrefix}/workflows/simple`;
    const incompleteMapping = {
      stateMapping: {
        Draft: 'Created',
        Approved: 'Approved',
        // Missing: Rejected, Rerejected, Deprecated
      },
    };

    await expect(
      update.apply({
        kind: 'edit',
        target: resourceName(name),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change',
          target: currentWorkflow,
          to: newWorkflow,
          mappingTable: incompleteMapping,
        },
      }),
    ).rejects.toThrow('State mapping validation failed');
  });

  it('try to update card type workflow with invalid target states (failure)', async () => {
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
    const newWorkflow = `${project.projectPrefix}/workflows/simple`;
    const invalidTargetMapping = {
      stateMapping: {
        Draft: 'InvalidState', // This state doesn't exist in simple workflow
        Approved: 'Approved',
        Rejected: 'Deprecated',
        Rerejected: 'Deprecated',
        Deprecated: 'Deprecated',
      },
    };

    await expect(
      update.apply({
        kind: 'edit',
        target: resourceName(name),
        updateKey: { key: 'workflow' },
        operation: {
          name: 'change',
          target: currentWorkflow,
          to: newWorkflow,
          mappingTable: invalidTargetMapping,
        },
      }),
    ).rejects.toThrow('State mapping validation failed');
  });
  it('update content - graphview viewTemplate', async () => {
    const name = `${project.projectPrefix}/graphViews/test`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'content', subKey: 'viewTemplate' },
      operation: { name: 'change', target: undefined, to: 'something here' },
    });

    const graphView = await project.resources.byType(name, 'graphViews').show();
    expect(graphView.content.viewTemplate).toBe('something here');
  });
  it('update content - graphModel model', async () => {
    const name = `${project.projectPrefix}/graphModels/test`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'content', subKey: 'model' },
      operation: { name: 'change', target: undefined, to: 'something here' },
    });

    const graphModel = await project.resources
      .byType(name, 'graphModels')
      .show();
    expect(graphModel.content.model).toBe('something here');
  });
  it('update content - report contentTemplate', async () => {
    const name = `${project.projectPrefix}/reports/testReport`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'content', subKey: 'contentTemplate' },
      operation: {
        name: 'change',
        target: undefined,
        to: 'new template content',
      },
    });

    const report = await project.resources.byType(name, 'reports').show();
    expect(report.content.contentTemplate).toBe('new template content');
  });
  it('update content - report schema', async () => {
    const name = `${project.projectPrefix}/reports/testReport`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    const newSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
      required: ['name', 'age'],
    };

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'content', subKey: 'schema' },
      operation: { name: 'change', target: undefined, to: newSchema },
    });

    const report = project.resources.byType(name, 'reports').show();
    expect(report.content.schema).toEqual(newSchema);
  });
  it('update content - report queryTemplate', async () => {
    const name = `${project.projectPrefix}/reports/testReport`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.apply({
      kind: 'edit',
      target: resourceName(name),
      updateKey: { key: 'content', subKey: 'queryTemplate' },
      operation: {
        name: 'change',
        target: undefined,
        to: 'new query content',
      },
    });

    const report = await project.resources.byType(name, 'reports').show();
    expect(report.content.queryTemplate).toBe('new query content');
  });
});
