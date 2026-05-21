import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import type { CardType } from '../src/interfaces/resource-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import type { Project } from '../src/containers/project.js';
import { Fetch, Show, Update } from '../src/commands/index.js';
import { getTestProject } from './helpers/test-utils.js';
import { ConfigurationLogger } from '../src/utils/configuration-logger.js';

const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-update-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
let project: Project;
let update: Update;
let fetch: Fetch;

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
    fetch = new Fetch(project);
  });

  it('update file resource', async () => {
    const name = `${project.projectPrefix}/workflows/decision`;
    const exists = project.resources.exists(name);
    const newName = `${project.projectPrefix}/workflows/newName`;
    expect(exists).toBe(true);

    await update.updateValue(name, 'change', 'name', newName);
    const workflows = project.resources.workflows();

    expect(workflows.at(0)!.data!.name).not.toBe(newName);
    expect(workflows.at(1)!.data!.name).toBe(newName);
  });
  it('update resource - rank item using string value (name)', async () => {
    const fetch = new Fetch(project);
    const show = new Show(project, fetch);
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const fileName = `${name}.json`;
    const moveToIndex = 0;

    const before = await show.showResource(name);
    const foundBefore = (before as CardType).customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    });
    const indexBefore = (before as CardType).customFields.indexOf(foundBefore!);

    await update.updateValue(
      fileName,
      'rank',
      'customFields',
      'decision/fieldTypes/finished',
      moveToIndex as unknown as string,
    );

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
    const fileName = `${name}.json`;
    const moveToIndex = 4;

    const before = (await show.showResource(name)) as CardType;
    const foundBefore = before.customFields.find((item) => {
      return item.name === 'decision/fieldTypes/finished';
    })!;
    const indexBefore = before.customFields.indexOf(foundBefore);

    await update.updateValue(
      fileName,
      'rank',
      'customFields',
      { name: 'decision/fieldTypes/finished' } as CardType,
      moveToIndex as unknown as object,
    );

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
      update.updateValue(name, 'change', 'name', invalidName),
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

    await update.updateValue(
      name,
      'change',
      'workflow',
      currentWorkflow,
      newWorkflow,
      stateMap,
    );

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
      update.updateValue(
        name,
        'change',
        'workflow',
        currentWorkflow,
        newWorkflow,
        incompleteMapping,
      ),
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
      update.updateValue(
        name,
        'change',
        'workflow',
        currentWorkflow,
        newWorkflow,
        invalidTargetMapping,
      ),
    ).rejects.toThrow('State mapping validation failed');
  });
  it('update content - graphview viewTemplate', async () => {
    const name = `${project.projectPrefix}/graphViews/test`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.updateValue(
      name,
      'change',
      'content/viewTemplate',
      'something here',
    );

    const graphView = await project.resources.byType(name, 'graphViews').show();
    expect(graphView.content.viewTemplate).toBe('something here');
  });
  it('update content - graphModel model', async () => {
    const name = `${project.projectPrefix}/graphModels/test`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.updateValue(name, 'change', 'content/model', 'something here');

    const graphModel = await project.resources
      .byType(name, 'graphModels')
      .show();
    expect(graphModel.content.model).toBe('something here');
  });
  it('update content - report contentTemplate', async () => {
    const name = `${project.projectPrefix}/reports/testReport`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.updateValue(
      name,
      'change',
      'content/contentTemplate',
      'new template content',
    );

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

    await update.updateValue(name, 'change', 'content/schema', newSchema);

    const report = project.resources.byType(name, 'reports').show();
    expect(report.content.schema).toEqual(newSchema);
  });
  it('update content - report queryTemplate', async () => {
    const name = `${project.projectPrefix}/reports/testReport`;
    const exists = project.resources.exists(name);
    expect(exists).toBe(true);

    await update.updateValue(
      name,
      'change',
      'content/queryTemplate',
      'new query content',
    );

    const report = await project.resources.byType(name, 'reports').show();
    expect(report.content.queryTemplate).toBe('new query content');
  });

  it('routes CardType workflow change through the mutation engine', async () => {
    const { ConfigurationLogger } = await import(
      '../src/utils/configuration-logger.js'
    );
    const name = `${project.projectPrefix}/cardTypes/decision`;
    const currentWorkflow = `${project.projectPrefix}/workflows/decision`;
    const newWorkflow = `${project.projectPrefix}/workflows/simple`;
    const stateMap = {
      stateMapping: {
        Draft: 'Created',
        Approved: 'Approved',
        Rejected: 'Deprecated',
        Rerejected: 'Deprecated',
        Deprecated: 'Deprecated',
      },
    };

    await update.updateValue(
      name,
      'change',
      'workflow',
      currentWorkflow,
      newWorkflow,
      stateMap,
    );

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) => e.kind === 'resource_edit' && e.target === name,
      ),
    ).toBe(true);
  });

  it('routes CardType delete through the mutation engine', async () => {
    const { ConfigurationLogger } = await import(
      '../src/utils/configuration-logger.js'
    );
    const { Remove } = await import('../src/commands/remove.js');
    const remove = new Remove(project, fetch);
    const name = `${project.projectPrefix}/cardTypes/decision`;

    await remove.remove('cardType', name);

    expect(project.resources.exists(name)).toBe(false);
    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some((e) => e.kind === 'resource_delete' && e.target === name),
    ).toBe(true);
  });
});

// Reuse the existing decision-records fixture.
const FIXTURE_PATH = join(
  import.meta.dirname,
  'test-data',
  'valid',
  'decision-records',
);
const tmpDir = join(import.meta.dirname, 'tmp-command-update-link-type');

describe('update command - link-type renames through ResourceMutations', () => {
  let project: Project;
  let projectPath: string;
  let update: Update;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    // Seed a card link that uses the 'test' link type so the cascade has
    // something to rewrite.
    const decision5Path = join(
      projectPath,
      'cardRoot',
      'decision_5',
      'index.json',
    );
    const decision5 = JSON.parse(await readFile(decision5Path, 'utf-8'));
    decision5.links = [
      { linkType: 'decision/linkTypes/test', cardKey: 'decision_6' },
    ];
    await writeFile(decision5Path, JSON.stringify(decision5, null, 4));

    project = getTestProject(projectPath);
    await project.populateCaches();
    update = new Update(project);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('routes link-type renames through the new mutation engine', async () => {
    const linkTypeName = `${project.projectPrefix}/linkTypes/test`;
    const newName = `${project.projectPrefix}/linkTypes/is-caused-by`;

    await update.applyResourceOperation(
      linkTypeName,
      { key: 'name' },
      { name: 'change', target: linkTypeName, to: newName },
    );

    // Confirm the rename happened and a log entry was written via the new engine.
    const logEntries = await ConfigurationLogger.entries(project.basePath);
    expect(
      logEntries.some(
        (e) => e.kind === 'resource_rename' && e.target === linkTypeName,
      ),
    ).toBe(true);
  });
});

describe('update command - field-type ops through ResourceMutations', () => {
  let project: Project;
  let projectPath: string;
  let update: Update;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-field-${Date.now()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);

    project = getTestProject(projectPath);
    await project.populateCaches();
    update = new Update(project);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('routes field-type renames through the new mutation engine', async () => {
    const fieldTypeName = `${project.projectPrefix}/fieldTypes/finished`;
    const newName = `${project.projectPrefix}/fieldTypes/completed`;

    await update.applyResourceOperation(
      fieldTypeName,
      { key: 'name' },
      { name: 'change', target: fieldTypeName, to: newName },
    );

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) => e.kind === 'resource_rename' && e.target === fieldTypeName,
      ),
    ).toBe(true);
  });

  it('routes field-type dataType changes through the new mutation engine', async () => {
    // commitDescription is already longText in the fixture;
    // use obsoletedBy (shortText) for a shortText→longText change.
    const fieldTypeName = `${project.projectPrefix}/fieldTypes/obsoletedBy`;

    await update.applyResourceOperation(
      fieldTypeName,
      { key: 'dataType' },
      { name: 'change', target: 'shortText', to: 'longText' },
    );

    const entries = await ConfigurationLogger.entries(project.basePath);
    expect(
      entries.some(
        (e) =>
          e.kind === 'resource_edit' &&
          e.target === fieldTypeName &&
          (e.payload as { key?: string }).key === 'dataType',
      ),
    ).toBe(true);
  });
});
