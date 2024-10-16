// testing
import { assert, expect } from 'chai';

// node
import { access } from 'node:fs/promises';
import { constants as fsConstants, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir, deleteDir, resolveTilde } from '../src/utils/file-utils.js';
import { Create } from '../src/create.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-create-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };
const optionsMini: CardsOptions = { projectPath: minimalPath };

describe('create command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(resolveTilde('~/project-name-unique/'), {
      recursive: true,
      force: true,
    });
  });
  // attachment
  it('attachment (success)', async () => {
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_5';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('attachment to template card (success)', async () => {
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_2';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('attachment to child card (success)', async () => {
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_6';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('attachment missing project', async () => {
    const projectPath = join(testDir, 'invalid/i-dont-exist');
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_5';
    const invalidOptions = { projectPath: projectPath };
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      invalidOptions,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('attachment missing card', async () => {
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_999';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('attachment missing attachment', async () => {
    const attachmentPath = join(testDir, 'attachments/i-dont-exist.txt');
    const cardId = 'decision_5';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('attachment exists already', async () => {
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_6';
    let result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  // card
  it('card (success)', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['card', 'decision/templates/simplepage'],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('card and validate (success)', async () => {
    let result = await commandHandler.command(
      Cmd.create,
      ['card', 'decision/templates/simplepage'],
      options,
    );
    expect(result.statusCode).to.equal(200);
    result = await commandHandler.command(Cmd.validate, [], options);
    console.log(result);
    expect(result.message).to.equal('Project structure validated');
  });
  it('card with parent (success)', async () => {
    const templateName = 'decision/templates/decision';
    const parentCard = 'decision_5';
    const result = await commandHandler.command(
      Cmd.create,
      ['card', templateName, parentCard],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('card incorrect template name', async () => {
    const templateName = 'i-dont-exist';
    const result = await commandHandler.command(
      Cmd.create,
      ['card', templateName],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('card missing project', async () => {
    const templateName = 'decision/templates/simplepage';
    const invalidOptions = {
      projectPath: join(testDir, 'valid/no-such-project'),
    };
    const result = await commandHandler.command(
      Cmd.create,
      ['card', templateName],
      invalidOptions,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('card incorrect or missing cardsConfig.json', async () => {
    const invalidOptions = {
      projectPath: join(testDir, 'invalid/missing-cardsConfig.json'),
    };
    const templateName = 'decision/templates/simplepage';
    const result = await commandHandler.command(
      Cmd.create,
      ['card', templateName],
      invalidOptions,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('card invalid cardsConfig.json', async () => {
    const invalidOptions = {
      projectPath: join(testDir, 'invalid/invalid-cardsConfig.json'),
    };
    const templateName = 'decision/templates/simplepage';
    const result = await commandHandler.command(
      Cmd.create,
      ['card', templateName],
      invalidOptions,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('card parent card missing', async () => {
    const parentCard = 'i-dont-exist';
    const templateName = 'decision/templates/simplepage';
    const result = await commandHandler.command(
      Cmd.create,
      ['card', templateName, parentCard],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  // todo: add more child card creation tests

  // card type
  it('cardType (success)', async () => {
    const cardType = 'test';
    const workflow = 'mini/workflows/default';
    const result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(400);
  });
  it('cardType create existing card type', async () => {
    const cardType = 'test';
    const workflow = 'mini/workflows/default';
    let result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('cardType create no workflow', async () => {
    const cardType = 'test';
    const workflow = 'i-do-not-exist';
    const result = await commandHandler.command(
      Cmd.create,
      ['cardType', cardType, workflow],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });

  // field type
  it('fieldType all supported types (success)', async () => {
    const fieldTypes = Create.supportedFieldTypes();
    for (const fieldType of fieldTypes) {
      const name = `ft_${fieldType}`;
      const result = await commandHandler.command(
        Cmd.create,
        ['fieldType', name, fieldType],
        optionsMini,
      );
      expect(result.statusCode).to.equal(200);
    }
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
    expect(result.statusCode).to.equal(400);
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
    expect(result1.statusCode).to.equal(200);
    expect(result2.statusCode).to.equal(400);
  });
  it('fieldType with invalid name', async () => {
    const name = `name1`;
    const dataType = 'integer';
    const result = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, dataType],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('fieldType with invalid type', async () => {
    const name = `name1`;
    const dataType = 'invalidType';
    const result = await commandHandler.command(
      Cmd.create,
      ['fieldType', name, dataType],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  // link
  it('create link (success)', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['link', 'decision_5', 'decision_6', 'decision/linkTypes/test'],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('create link with different description(success)', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      [
        'link',
        'decision_5',
        'decision_6',
        'decision/linkTypes/test',
        'description2',
      ],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('try create link - link already exists', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['link', 'decision_5', 'decision_6', 'decision/linkTypes/test'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  it('try create link - card does not exist', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      [
        'link',
        'card-does-not-exist',
        'card-does-not-exist',
        'decision/linkTypes/test',
      ],
      options,
    );

    expect(result.statusCode).to.equal(400);
  });

  it('try create link - card type not valid', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['link', 'decision_5', 'decision_6', 'decision/linkTypes/testTypes'],
      options,
    );

    expect(result.message).to.contain('cannot be linked');
  });

  it('try create link - link description provided but not allowed', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      [
        'link',
        'decision_5',
        'decision_6',
        'decision/linkTypes/testTypes',
        'description2',
      ],
      options,
    );
    expect(result.message).to.contain('does not allow');
  });

  // link type
  it('linkType (success)', async () => {
    const name = 'lt_name';
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(400);
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
    expect(result1.statusCode).to.equal(200);
    expect(result2.statusCode).to.equal(400);
  });

  it('linkType with invalid name', async () => {
    const name = 'lt_name';
    const result = await commandHandler.command(
      Cmd.create,
      ['linkType', name],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });

  // project
  it('project (success)', async () => {
    const prefix = 'proj';
    const name = 'test-project';
    const projectDir = join(testDir, name);
    const testOptions: CardsOptions = { projectPath: projectDir };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    try {
      await access(projectDir, fsConstants.R_OK);
    } catch (error) {
      if (error instanceof Error) {
        assert(false, 'project folder could not be created');
      }
    }
    expect(result.statusCode).to.equal(200);
  });
  it('project with user home path (success)', async () => {
    const path = '~/project-name-unique';
    const prefix = 'proj';
    const name = 'test-project';
    const testOptions: CardsOptions = { projectPath: path };

    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    try {
      // nodeJS does not automatically expand paths with tilde
      await access(resolveTilde(path), fsConstants.F_OK);
    } catch (error) {
      if (error instanceof Error) {
        assert(false, 'project folder could not be created');
      }
    }
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(200);
    await deleteDir(name);
  });
  it('project missing target', async () => {
    const testOptions = { projectPath: '' };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', '', ''],
      testOptions,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('project invalid path', async () => {
    const testOptions = { projectPath: 'lpt1' };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', '', ''],
      testOptions,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('project path already exists', async () => {
    const testOptions = { projectPath: '.' };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', '', ''],
      testOptions,
    );
    expect(result.statusCode).to.equal(400);
  });

  // template
  it('template (success)', async () => {
    const templateName = 'template-name_first';
    const templateContent = '{}';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('template with "local"', async () => {
    // local is no longer a valid name part.
    const templateName = 'local/templates/template-name_second';
    const templateContent = '{}';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('template with default parameters (success)', async () => {
    const templateName = 'validname';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('template with no content (success)', async () => {
    const templateName = 'anotherValidName';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
  });

  it('template with "loc"', async () => {
    const templateName = 'loc/templates/template-name_second';
    const templateContent = '{}';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('template with "123"', async () => {
    const templateName = 'loc/123';
    const templateContent = '{}';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('template invalid project', async () => {
    const templateName = 'validName';
    const templateContent = '{}';
    const invalidOptions = { projectPath: join(testDir, 'no-such-project') };
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      invalidOptions,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('template invalid template name', async () => {
    const templateName = 'aux';
    const templateContent = '{}';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('template already exists', async () => {
    const templateName = 'decision/templates/decision';
    const templateContent = '{}';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  // todo: same as test on row 701?
  it('template invalid template name (reserved Windows filename)', async () => {
    const templateName = 'aux';
    const templateContent = '{}';
    const testOptions = { projectPath: join(testDir, 'test-template.json') };
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      testOptions,
    );
    expect(result.statusCode).to.equal(400);
  });

  // workflow
  it('workflow (success)', async () => {
    const workflowName = 'uniqueWorkflowName';
    const content = `
          {
            "name": "${workflowName}",
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
    expect(result.statusCode).to.equal(200);
  });
  it('workflow with default content (success)', async () => {
    const workflowName = 'anotherUniqueWorkflowName';
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, ''],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(400);
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
    expect(result.statusCode).to.equal(400);
  });
  it('workflow with existing name', async () => {
    const workflowName = 'default';
    const result = await commandHandler.command(
      Cmd.create,
      ['workflow', workflowName, ''],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('access default parameters for template (success)', () => {
    const defaultContent = Create.defaultTemplateContent();
    expect(defaultContent.displayName).to.equal(undefined);
    expect(defaultContent.category).to.equal(undefined);
    expect(defaultContent.description).to.equal(undefined);
  });
  it('access default parameters for workflow (success)', () => {
    const defaultContent = Create.defaultWorkflowContent('test');
    expect(defaultContent.name).to.equal('test');
    expect(defaultContent.states.length).to.equal(3);
    expect(defaultContent.transitions.length).to.equal(3);
  });
});
