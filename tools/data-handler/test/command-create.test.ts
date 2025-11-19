// testing
import { expect } from 'chai';

// node
import { access } from 'node:fs/promises';
import { constants as fsConstants, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Cmd, Commands } from '../src/command-handler.js';
import { copyDir, deleteDir, resolveTilde } from '../src/utils/file-utils.js';
import { DefaultContent } from '../src/resources/create-defaults.js';
import { FieldTypeResource } from '../src/resources/field-type-resource.js';
import { getTestProject } from './helpers/test-utils.js';

import type { CreateCommandOptions } from '../src/interfaces/command-options.js';
import type {
  Card,
  CardListContainer,
} from '../src/interfaces/project-interfaces.js';

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
    parameters.at(0) === 'attachments' ||
    parameters.at(0) === 'cardTypes' ||
    parameters.at(0) === 'fieldTypes' ||
    parameters.at(0) === 'linkTypes' ||
    parameters.at(0) === 'reports' ||
    parameters.at(0) === 'templates'
  ) {
    return resources.payload ? (resources.payload as object[]).length : 0;
  }
  if (parameters.at(0) === 'cards') {
    if (resources && resources.payload) {
      const payload = resources.payload as CardListContainer[];
      return payload.at(0)?.cards.length || 0;
    }
  }
  return 0;
}

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
    const attachmentCountBefore = await countOfResources(['attachments']);
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_5';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(200);
    const attachmentCountAfter = await countOfResources(['attachments']);
    expect(attachmentCountBefore + 1).to.equal(attachmentCountAfter);
  });
  it('attachment to template card (success)', async () => {
    const attachmentCountBefore = await countOfResources(['attachments']);
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_2';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(200);
    const attachmentCountAfter = await countOfResources(['attachments']);
    expect(attachmentCountBefore + 1).to.equal(attachmentCountAfter);
  });
  it('attachment to child card (success)', async () => {
    const attachmentCountBefore = await countOfResources(['attachments']);
    const attachmentPath = join(testDir, 'attachments/the-needle.heic');
    const cardId = 'decision_6';
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(200);
    const attachmentCountAfter = await countOfResources(['attachments']);
    expect(attachmentCountBefore + 1).to.equal(attachmentCountAfter);
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
    await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    const result = await commandHandler.command(
      Cmd.create,
      ['attachment', cardId, attachmentPath],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  // card
  it('create card (success)', async () => {
    const cardsCountBefore = await countOfResources(['cards']);
    const result = await commandHandler.command(
      Cmd.create,
      ['card', 'decision/templates/simplepage'],
      options,
    );
    expect(result.statusCode).to.equal(200);
    const cardsCountAfter = await countOfResources(['cards']);
    // There are three cards in the template
    expect(cardsCountBefore + 3).to.equal(cardsCountAfter);
  });
  it('card and validate (success)', async () => {
    const cardsCountBefore = await countOfResources(['cards']);
    let result = await commandHandler.command(
      Cmd.create,
      ['card', 'decision/templates/simplepage'],
      options,
    );
    expect(result.statusCode).to.equal(200);
    const cardsCountAfter = await countOfResources(['cards']);
    result = await commandHandler.command(Cmd.validate, [], options);
    expect(result.message).to.equal('Project structure validated');
    // There are three cards in the template
    expect(cardsCountBefore + 3).to.equal(cardsCountAfter);
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

    // Check that created card contains custom fields, but not calculated fields
    const createdCard = result.affectsCards?.at(0) || '';
    const cardDetails = (
      await commandHandler.command(Cmd.show, ['card', createdCard], options)
    ).payload;
    if (cardDetails) {
      expect((cardDetails as Card).metadata).to.not.include.keys(
        'decision/fieldTypes/obsoletedBy',
      );
      expect((cardDetails as Card).metadata).to.include.keys(
        'decision/fieldTypes/admins',
      );
    }
  });

  it('card incorrect template name', async () => {
    const templateName = 'i-dont-exist';
    const result = await commandHandler.command(
      Cmd.create,
      ['card', templateName],
      options,
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
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(400);
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
      expect(result.statusCode).to.equal(200);
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
    const name = `nameÄ`;
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
  it('create a label (success)', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', 'decision_6', 'test'],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });
  it('create a label in a template (success)', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', 'decision_1', 'test'],
      options,
    );
    expect(result.statusCode).to.equal(200);
  });

  it('try create a label - label exists', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', 'decision_5', 'test'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  it('try create a label - invalid character in name', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', 'decision_6', 'testö'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  it('try create a label - whitespace character in the beginning of a name', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', 'decision_6', ' test'],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  it('try create a label - empty name', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', 'decision_6', ''],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });

  it('try create a label - too long label', async () => {
    const result = await commandHandler.command(
      Cmd.create,
      ['label', 'decision_6', 'a'.repeat(500)],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  // link - three tests commented out for now (see INTDEV-512). When doing INTDEV-512, also add a test which makes sure createLink fails if source and destination cards are the same
  // it('create link (success)', async () => {
  //   const result = await commandHandler.command(
  //     Cmd.create,
  //     ['link', 'decision_5', 'decision_6', 'decision/linkTypes/test'],
  //     options,
  //   );
  //   expect(result.statusCode).to.equal(200);
  // });
  // it('create link with different description(success)', async () => {
  //   const result = await commandHandler.command(
  //     Cmd.create,
  //     [
  //       'link',
  //       'decision_5',
  //       'decision_6',
  //       'decision/linkTypes/test',
  //       'description2',
  //     ],
  //     options,
  //   );
  //   expect(result.statusCode).to.equal(200);
  // });
  // it('try create link - link already exists', async () => {
  //   const result = await commandHandler.command(
  //     Cmd.create,
  //     ['link', 'decision_5', 'decision_6', 'decision/linkTypes/test'],
  //     options,
  //   );
  //   expect(result.statusCode).to.equal(400);
  // });

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
    expect(result.statusCode).to.equal(200);
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
    const testOptions: CreateCommandOptions = { projectPath: projectDir };
    const result = await commandHandler.command(
      Cmd.create,
      ['project', name, prefix],
      testOptions,
    );
    await expect(access(projectDir, fsConstants.F_OK)).to.be.fulfilled;
    expect(result.statusCode).to.equal(200);
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
    await expect(access(resolveTilde(path), fsConstants.F_OK)).to.be.fulfilled;
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
    expect(result.statusCode).to.equal(400);
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
    expect(result.statusCode).to.equal(400);
    expect(result.message).to.include('invalid');
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

  // report
  it('report (success)', async () => {
    const reportsCountBefore = await countOfResources(['reports'], optionsMini);
    const reportName = 'report-name';
    const result = await commandHandler.command(
      Cmd.create,
      ['report', reportName],
      optionsMini,
    );
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(200);
    result = await commandHandler.command(Cmd.validate, [], optionsMini);
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(400);
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
    expect(result.statusCode).to.equal(200);
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
    expect(result.statusCode).to.equal(400);
  });
  it('template with default parameters (success)', async () => {
    const templateName = 'validName';
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
  it('template and validate (success)', async () => {
    const templateName = 'validatedTemplate';
    let result = await commandHandler.command(
      Cmd.create,
      ['template', templateName],
      options,
    );
    expect(result.statusCode).to.equal(200);
    result = await commandHandler.command(Cmd.validate, [], options);
    expect(result.message).to.equal('Project structure validated');
  });
  it('template with "loc"', async () => {
    const templateName = 'loc/templates/template-name_second';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('template with "123"', async () => {
    const templateName = 'loc/123';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      optionsMini,
    );
    expect(result.statusCode).to.equal(400);
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
    expect(result.statusCode).to.equal(400);
  });
  it('template invalid template name', async () => {
    const templateName = 'aux';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      options,
    );
    expect(result.statusCode).to.equal(400);
  });
  it('template already exists', async () => {
    const templateName = 'decision/templates/decision';
    const templateContent = '';
    const result = await commandHandler.command(
      Cmd.create,
      ['template', templateName, templateContent],
      options,
    );
    expect(result.statusCode).to.equal(400);
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
    const defaultContent = DefaultContent.template('testName');
    expect(defaultContent.displayName).to.equal('');
    expect(defaultContent.category).to.equal(undefined);
  });
  it('access default parameters for workflow (success)', () => {
    const defaultContent = DefaultContent.workflow('test');
    expect(defaultContent.name).to.equal('test');
    expect(defaultContent.states.length).to.equal(3);
    expect(defaultContent.transitions.length).to.equal(3);
  });
  it('access default values for card (success)', () => {
    const defaultCardType = DefaultContent.cardType('test', 'testWorkflow');
    const defaultCard = DefaultContent.card(defaultCardType);
    expect(defaultCard.cardType).to.equal('test');
    expect(defaultCard.rank).to.equal('');
    expect(defaultCard.title).to.equal('Untitled');
    expect(defaultCard.workflowState).to.equal('');
  });
  it('access default values for card using real card type and template cards (success)', async () => {
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();

    const name = 'decision/templates/decision';
    const template = project.resources
      .byType(name, 'templates')
      .templateObject();
    const templateCards = template?.cards('');

    const cardType = DefaultContent.cardType(
      'decision/cardTypes/decision',
      'decision/workflows/decision',
    );
    const defaultCard = DefaultContent.card(cardType, templateCards);
    expect(defaultCard.cardType).to.equal('decision/cardTypes/decision');
    expect(defaultCard.rank).to.equal('0|b');
    expect(defaultCard.title).to.equal('Untitled');
    expect(defaultCard.workflowState).to.equal('');
  });
});
