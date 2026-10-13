// testing
import { expect, it, describe, beforeAll, afterAll } from 'vitest';

// node
import { access } from 'node:fs/promises';
import {
  constants as fsConstants,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

import { Cmd, Commands, Workspace } from '../src/command-handler.js';
import { copyDir, deleteDir, resolveTilde } from '../src/utils/file-utils.js';
import { DefaultContent } from '../src/resources/create-defaults.js';
import { FieldTypeResource } from '../src/resources/field-type-resource.js';
import { getTestProject } from './helpers/test-utils.js';

import type { CreateCommandOptions } from '../src/interfaces/command-options.js';
import { Checkout } from '../src/containers/project.js';
import { Validate } from '../src/commands/index.js';
import { findCard } from '../src/cards/read.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import { SYSTEM_ACTOR } from '../src/utils/tx-record.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-create-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();

const options: CreateCommandOptions = { projectPath: decisionRecordsPath };
const optionsMini: CreateCommandOptions = { projectPath: minimalPath };

// Helper to get current resource count.
async function countOfResources(
  parameters: string[],
  opts: CreateCommandOptions = options,
): Promise<number> {
  const resources = await commandHandler.command(
    Cmd.show,
    [...parameters],
    opts,
  );
  if (
    parameters.at(0) === 'cardTypes' ||
    parameters.at(0) === 'fieldTypes' ||
    parameters.at(0) === 'linkTypes' ||
    parameters.at(0) === 'reports' ||
    parameters.at(0) === 'templates'
  ) {
    return resources.payload ? (resources.payload as object[]).length : 0;
  }
  return 0;
}

describe('create command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(resolveTilde('~/project-name-unique/'), {
      recursive: true,
      force: true,
    });
  });

  // card type
  it('cardType (success)', async () => {
    const cardTypesCountBefore = await countOfResources(
      ['cardTypes'],
      optionsMini,
    );
    const cardType = 'test';
    const workflow = 'mini/workflows/default';
    const result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    const cardTypesCountAfter = await countOfResources(
      ['cardTypes'],
      optionsMini,
    );
    expect(cardTypesCountBefore + 1).equals(cardTypesCountAfter);
  });
  it('cardType with name only', async () => {
    const cardTypesCountBefore = await countOfResources(
      ['cardTypes'],
      optionsMini,
    );
    const cardType = 'mini/cardTypes/test-test';
    const workflow = 'mini/workflows/default';
    const result = await commandHandler.command(
      Cmd.create,
      [cardType, workflow],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    const cardTypesCountAfter = await countOfResources(
      ['cardTypes'],
      optionsMini,
    );
    expect(cardTypesCountBefore + 1).equals(cardTypesCountAfter);
  });
  it('cardType invalid project', async () => {
    const cardType = 'test';
    const workflow = 'mini/workflows/default';
    const invalidOptions = {
      projectPath: join(testDir, 'valid/no-such-project'),
    };
    const result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      invalidOptions,
    );
    expect(result.statusCode).toBe(400);
  });
  it('cardType create existing card type', async () => {
    const cardType = 'test';
    const workflow = 'mini/workflows/default';
    await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    const result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('cardType create no workflow', async () => {
    const cardType = 'test';
    const workflow = 'i-do-not-exist';
    const result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });

  // field type
  it('fieldType all supported types (success)', async () => {
    const fieldTypesCountBefore = await countOfResources(
      ['fieldTypes'],
      optionsMini,
    );
    const fieldTypes = FieldTypeResource.fieldDataTypes();
    for (const fieldType of fieldTypes) {
      const name = `ft_${fieldType}`;
      const result = await commandHandler.command(
        Cmd.create,
        ['fieldType', name, fieldType],
        optionsMini,
      );
      expect(result.statusCode).toBe(200);
    }
    const fieldTypesCountAfter = await countOfResources(
      ['fieldTypes'],
      optionsMini,
    );
    expect(fieldTypesCountBefore + fieldTypes.length).equals(
      fieldTypesCountAfter,
    );
  });
  it('fieldType invalid project', async () => {
    const name = `name`;
    const dataType = 'integer';
    const invalidOptions = {
      projectPath: join(testDir, 'valid/no-such-project'),
    };
    const result = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, dataType],
      invalidOptions,
    );
    expect(result.statusCode).toBe(400);
  });
  it('fieldType name already exists', async () => {
    const name = `name`;
    const dataType1 = 'integer';
    const dataType2 = 'number';
    const result1 = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, dataType1],
      optionsMini,
    );
    const result2 = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, dataType2],
      optionsMini,
    );
    expect(result1.statusCode).toBe(200);
    expect(result2.statusCode).toBe(400);
  });
  it('fieldType with invalid name', async () => {
    const name = `nameÄ`;
    const dataType = 'integer';
    const result = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, dataType],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('fieldType with invalid type', async () => {
    const name = `name1`;
    const dataType = 'invalidType';
    const result = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, dataType],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });

  // link type
  it('linkType (success)', async () => {
    const linkTypeCountBefore = await countOfResources(
      ['linkTypes'],
      optionsMini,
    );
    const name = 'lt_name';
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    const linkTypeCountAfter = await countOfResources(
      ['linkTypes'],
      optionsMini,
    );
    expect(linkTypeCountBefore + 1).equals(linkTypeCountAfter);
  });

  it('linkType invalid project', async () => {
    const name = 'lt_name';
    const invalidOptions = {
      projectPath: join(testDir, 'valid/no-such-project'),
    };
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      invalidOptions,
    );
    expect(result.statusCode).toBe(400);
  });

  it('linkType name already exists', async () => {
    const name = 'lt_name_exists';
    const result1 = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      optionsMini,
    );
    const result2 = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      optionsMini,
    );
    expect(result1.statusCode).toBe(200);
    expect(result2.statusCode).toBe(400);
  });

  it('linkType with invalid name', async () => {
    const name = 'lt_name';
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });

  it('linkType with a dotted name fails and creates nothing', async () => {
    const before = await countOfResources(['linkTypes'], optionsMini);
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', 'a.b.c'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('ENOENT');
    expect(await countOfResources(['linkTypes'], optionsMini)).toBe(before);
  });

  // project
  it('project (success)', async () => {
    const prefix = 'proj';
    const name = 'test-project';
    const projectDir = join(testDir, name);
    const testOptions: CreateCommandOptions = { projectPath: projectDir };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    await expect(access(projectDir, fsConstants.F_OK)).resolves.not.toThrow();
    expect(result.statusCode).toBe(200);
  });
  it('project with user home path (success)', async () => {
    const path = '~/project-name-unique';
    const prefix = 'proj';
    const name = 'test-project';
    const testOptions: CreateCommandOptions = { projectPath: path };

    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    await expect(
      access(resolveTilde(path), fsConstants.F_OK),
    ).resolves.not.toThrow();
    expect(result.statusCode).toBe(200);
  });
  it('project creation without options (success)', async () => {
    const prefix = 'demo';
    const name = 'demo';
    const testOptions = { projectPath: name };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    expect(result.statusCode).toBe(200);
    await deleteDir(name);
  });
  it('project missing target', async () => {
    const testOptions = { projectPath: '' };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', '', ''],
      testOptions,
    );
    expect(result.statusCode).toBe(400);
  });
  it('project invalid path', async () => {
    const testOptions = { projectPath: 'lpt1' };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', '', ''],
      testOptions,
    );
    expect(result.statusCode).toBe(400);
  });
  it('project with uppercase prefix', async () => {
    const prefix = 'Test';
    const name = 'Test Project';
    const projectDir = join(testDir, 'test-uppercase-prefix');
    const testOptions: CreateCommandOptions = { projectPath: projectDir };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).to.include('invalid prefix');
  });
  it('project with forbidden folder name', async () => {
    const prefix = 'test';
    const name = 'Test Project';
    const projectDir = join(testDir, 'lpt1'); // Windows cannot handle certain filenames
    const testOptions: CreateCommandOptions = { projectPath: projectDir };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).to.include('invalid');
  });
  it('project path already exists', async () => {
    const testOptions = { projectPath: '.' };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', '', ''],
      testOptions,
    );
    expect(result.statusCode).toBe(400);
  });
  it('should create project with optional values', async () => {
    const prefix = 'cdes';
    const name = 'test-project-with-category';
    const category = 'Development';
    const description = 'A test project with category and description';
    const projectDir = join(testDir, name);
    const testOptions: CreateCommandOptions = { projectPath: projectDir };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix, projectDir, category, description],
      testOptions,
    );
    await expect(access(projectDir, fsConstants.F_OK)).resolves.not.toThrow();
    expect(result.statusCode).toBe(200);

    const configPath = join(projectDir, '.cards', 'local', 'cardsConfig.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(config.category).toBe(category);
    expect(config.description).toBe(description);
    const validator = new Validate();
    const validationResult = await validator.validate(
      projectDir,
      () => new Checkout(projectDir),
    );
    expect(validationResult.length).equals(0);
  });

  // report
  it('report (success)', async () => {
    const reportsCountBefore = await countOfResources(['reports'], optionsMini);
    const reportName = 'report-name';
    const result = await commandHandler.command(
      Cmd.create,
      ['report', reportName],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    const reportsCountAfter = await countOfResources(['reports'], optionsMini);
    expect(reportsCountBefore + 1).equals(reportsCountAfter);
  });
  it('report and validate', async () => {
    const reportName = 'report-name-second';
    let result = await commandHandler.command(
      Cmd.create,
      ['report', reportName],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    result = await commandHandler.command(Cmd.validate, [], optionsMini);
    expect(result.statusCode).toBe(200);
  });
  it('try to create report with same name', async () => {
    const reportName = 'report-name';
    await commandHandler.command(
      Cmd.create,
      ['report', reportName],
      optionsMini,
    );
    const result = await commandHandler.command(
      Cmd.create,
      ['report', reportName],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  // template
  it('template (success)', async () => {
    const templatesCountBefore = await countOfResources(
      ['templates'],
      optionsMini,
    );
    const templateName = 'template-name_first';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
    const templatesCountAfter = await countOfResources(
      ['templates'],
      optionsMini,
    );
    expect(templatesCountBefore + 1).equals(templatesCountAfter);
  });
  it('template with "local"', async () => {
    // local is no longer a valid name part.
    const templateName = 'local/templates/template-name_second';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('template with default parameters (success)', async () => {
    const templateName = 'validName';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
  });
  it('template with no content (success)', async () => {
    const templateName = 'anotherValidName';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
  });
  it('template and validate (success)', async () => {
    const templateName = 'validatedTemplate';
    let result = await commandHandler.command(
      Cmd.create,
      ['template', templateName],
      options,
    );
    expect(result.statusCode).toBe(200);
    result = await commandHandler.command(Cmd.validate, [], options);
    expect(result.message).toBe('Project structure validated');
  });
  it('template with "loc"', async () => {
    const templateName = 'loc/templates/template-name_second';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('template with "123"', async () => {
    const templateName = 'loc/123';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('template invalid project', async () => {
    const templateName = 'validName';
    const templateContent = '';
    const invalidOptions = { projectPath: join(testDir, 'no-such-project') };
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      invalidOptions,
    );
    expect(result.statusCode).toBe(400);
  });
  it('template invalid template name', async () => {
    const templateName = 'aux';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  it('template already exists', async () => {
    const templateName = 'decision/templates/decision';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      options,
    );
    expect(result.statusCode).toBe(400);
  });
  // workflow
  it('workflow (success)', async () => {
    const workflowName = 'uniqueWorkflowName';
    const content = `
        {
          "name": "${workflowName}",
          "displayName": "",
          "states": [
              { "name": "Open", "category": "initial" },
              { "name": "In Progress", "category": "active" },
              { "name": "Closed", "category": "closed" }
          ],
          "transitions": [
              {
                  "name": "Create",
                  "fromState": [""],
                  "toState": "Open"
              },
              {
                  "name": "Working",
                  "fromState": ["Open"],
                  "toState": "In Progress"
              },
              {
                  "name": "Done",
                  "fromState": ["*"],
                  "toState": "Closed"
              },
              {
                  "name": "Reopen",
                  "fromState": ["Closed"],
                  "toState": "Open"
              }
          ]
        }`;
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, content],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
  });
  it('workflow with default content (success)', async () => {
    const workflowName = 'anotherUniqueWorkflowName';
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, ''],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);
  });
  it('workflow invalid workflow schema', async () => {
    const workflowName = 'default';
    const content = `
        {
          "name": "${workflowName}",
          "wrongKey1": "dog",
          "wrongKey2": "cat"
        }`;
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, content],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('workflow invalid project', async () => {
    const workflowName = 'default';
    const content = `
        {
          "name": "${workflowName}",
          "states": [
              { "name": "Open" },
              { "name": "In Progress" },
              { "name": "Closed" }
          ],
          "transitions": [
              {
                  "name": "Create",
                  "fromState": [""],
                  "toState": "Open"
              },
              {
                  "name": "Working",
                  "fromState": ["Open"],
                  "toState": "In Progress"
              },
              {
                  "name": "Done",
                  "fromState": ["*"],
                  "toState": "Closed"
              },
              {
                  "name": "Reopen",
                  "fromState": ["Closed"],
                  "toState": "Open"
              }
          ]
        }`;

    const invalidOptions = {
      projectPath: join(testDir, 'valid/no-such-project'),
    };
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, content],
      invalidOptions,
    );
    expect(result.statusCode).toBe(400);
  });
  it('workflow with existing name', async () => {
    const workflowName = 'default';
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, ''],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
  });
  it('access default parameters for template (success)', () => {
    const defaultContent = DefaultContent.template('testName');
    expect(defaultContent.displayName).toBe('');
    expect(defaultContent.category).toBe(undefined);
  });
  it('should create workflow without category', async () => {
    const workflowName = 'workflowWithoutCategory';
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, ''],
      optionsMini,
    );
    expect(result.statusCode).toBe(200);

    const checkout = getTestProject(minimalPath);
    await checkout.populateCaches();
    const workflow = checkout.resources.byType(
      `mini/workflows/${workflowName}`,
      'workflows',
    );
    expect(workflow.data?.category).toBe(undefined);
  });
  it('access default parameters for workflow (success)', () => {
    const defaultContent = DefaultContent.workflow('test');
    expect(defaultContent.name).toBe('test');
    expect(defaultContent.states.length).toBe(3);
    expect(defaultContent.transitions.length).toBe(3);
  });
  it('access default values for card (success)', () => {
    const defaultCardType = DefaultContent.cardType('test', 'testWorkflow');
    const defaultCard = DefaultContent.card(defaultCardType);
    expect(defaultCard.cardType).toBe('test');
    expect(defaultCard.rank).toBe('');
    expect(defaultCard.title).toBe('Untitled');
    expect(defaultCard.workflowState).toBe('');
  });
});

describe('created cards and custom field values', () => {
  const testRoot = join(import.meta.dirname, 'tmp-create-no-nulls-tests');
  const projectPath = join(testRoot, 'valid/decision-records');
  const templateName = 'decision/templates/decision';
  let ws: Workspace;

  beforeAll(async () => {
    mkdirSync(testRoot, { recursive: true });
    await copyDir('test/test-data/', testRoot);
    ws = await openTestWorkspace(projectPath, {});
  });

  afterAll(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('new cards do not contain null custom-field placeholders', async () => {
    const created = await ws.cards.create(templateName, undefined);
    const card = findCard(ws.checkout, created[0].key);
    const nullCustomFieldKeys = (metadata: object) =>
      Object.entries(metadata)
        .filter(([key, value]) => value === null && key.includes('/'))
        .map(([key]) => key);

    expect(nullCustomFieldKeys(card.metadata!)).toEqual([]);

    const persisted = JSON.parse(
      readFileSync(join(card.path, 'index.json'), 'utf-8'),
    );
    expect(nullCustomFieldKeys(persisted)).toEqual([]);
  });

  it('cards added to a template get no null placeholders', async () => {
    // 'decision/cardTypes/decision' declares eight non-calculated custom fields;
    // the empty template keeps this out of the way of the tests below.
    const added = await ws.cards.addToTemplate(
      'decision/cardTypes/decision',
      'decision/templates/empty',
    );
    const card = findCard(ws.checkout, added[0]);
    const customFieldKeys = Object.keys(card.metadata!).filter((key) =>
      key.includes('/'),
    );
    expect(customFieldKeys).toEqual([]);
  });

  it('reports a card the template does not hold as not part of it', async () => {
    await expect(
      ws.cards.addToTemplate(
        'decision/cardTypes/decision',
        'decision/templates/decision',
        'idontexist',
      ),
    ).rejects.toThrow("Card 'idontexist' is not part of template");
  });

  it('falsy template values survive instantiation', async () => {
    // Mutates the shared template card, so this test must stay last.
    const templateCards = ws.checkout.templateTree(templateName).cards();
    const templateCard = templateCards.at(0)!;
    await ws.cards.editField(
      templateCard.key,
      'decision/fieldTypes/finished',
      false,
    );

    const created = await ws.cards.create(templateName, undefined);
    const card = findCard(ws.checkout, created[0].key);
    expect(card.metadata!['decision/fieldTypes/finished']).toBe(false);
  });
});

describe('CommandManager.createProjectWithDefaults', () => {
  const testRoot = join(import.meta.dirname, 'tmp-createWithDefaults-tests');
  const projectPath = join(testRoot, 'createWithDefaults-test');

  beforeAll(async () => {
    // Create test directory
    mkdirSync(testRoot, { recursive: true });
    // Clean up from any previous test runs
    await deleteDir(projectPath);
  });

  afterAll(async () => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('creates a project with correct configuration', async () => {
    const ws = await Workspace.createProjectWithDefaults(
      projectPath,
      {
        name: 'Test Defaults',
        prefix: 'testdef',
        category: 'Test',
        description: 'A test',
      },
      SYSTEM_ACTOR,
      undefined,
    );

    expect(ws).toBeInstanceOf(Workspace);
    expect(ws.checkout.configuration.name).toBe('Test Defaults');
    expect(ws.checkout.configuration.cardKeyPrefix).toBe('testdef');
    expect(ws.checkout.configuration.category).toBe('Test');
    expect(ws.checkout.configuration.description).toBe('A test');

    // Check project structure exists
    await expect(access(projectPath, fsConstants.F_OK)).resolves.not.toThrow();
    await expect(
      access(join(projectPath, '.cards', 'local'), fsConstants.F_OK),
    ).resolves.not.toThrow();
    await expect(
      access(join(projectPath, 'cardRoot'), fsConstants.F_OK),
    ).resolves.not.toThrow();
  });

  it('accepts git user option', async () => {
    const userProjectPath = join(testRoot, 'createWithDefaults-user-test');
    try {
      const ws = await Workspace.createProjectWithDefaults(
        userProjectPath,
        { name: 'User Project', prefix: 'userproj' },
        { kind: 'user', id: 'test-user', name: 'Test User' },
        { name: 'Test User', email: 'test@example.com' },
      );

      expect(ws).toBeInstanceOf(Workspace);
      expect(ws.checkout.configuration.name).toBe('User Project');
    } finally {
      await deleteDir(userProjectPath);
    }
  });
});
