// testing
import { expect } from 'chai';
import * as sinon from 'sinon';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { type CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { Project } from '../src/containers/project.js';
import { Calculate, Show } from '../src/commands/index.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-import-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const optionsMini: CardsOptions = { projectPath: minimalPath };
const options: CardsOptions = { projectPath: decisionRecordsPath };

describe('import csv command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('import csv file (success)', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv')],
      options,
    );
    expect(result.statusCode).to.equal(200);

    const [key1, key2] = result.payload as string[];

    const project = new Project(decisionRecordsPath);
    const calculate = new Calculate(project);
    const show = new Show(project, calculate);
    const card1 = await show.showCardDetails(
      { metadata: true, content: true },
      key1,
    );
    const card2 = await show.showCardDetails(
      { metadata: true, content: true },
      key2,
    );
    expect(card1.metadata?.title).to.equal('Title1');
    expect(card1.content).to.equal('content1');
    expect(card1.metadata?.labels).to.deep.equal([
      'template-test-label',
      'label-first',
      'label-second',
    ]);
    expect(card1.metadata?.['decision/fieldTypes/responsible']).to.equal(
      'responsible@email.com',
    );
    expect(card1.metadata?.doesnotexist).to.equal(undefined);
    expect(card2.metadata?.title).to.equal('Title2');
    expect(card2.content).to.equal('content2');
    // no labels specified, takes them from the template
    expect(card2.metadata?.labels).to.deep.equal(['template-test-label']);
    expect(card2.metadata?.['decision/fieldTypes/responsible']).to.equal('');
    expect(card2.metadata?.doesnotexist).to.equal(undefined);
  });
  it('import csv file with parent (success)', async () => {
    const parent = 'decision_6';
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv'), parent],
      options,
    );
    expect(result.statusCode).to.equal(200);

    const createdKeys = result.payload as string[];
    const project = new Project(decisionRecordsPath);
    const calculate = new Calculate(project);
    const show = new Show(project, calculate);

    const parentCard = await show.showCardDetails(
      { metadata: true, content: true, children: true },
      parent,
    );

    expect(createdKeys.length).to.equal(2);
    expect(parentCard.children?.map((c) => c.key)).to.contain(createdKeys[0]);
    expect(parentCard.children?.map((c) => c.key)).to.contain(createdKeys[1]);
  });
  it('try to import csv file without all required columns', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'invalid-missing-columns-real.csv')],
      options,
    );
    expect(result.statusCode).to.equal(400);
    expect(result.message).to.contain('requires property "template"');
  });
  it('try to import csv file with invalid path', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', 'i-dont-exist.csv'],
      options,
    );
    expect(result.statusCode).to.equal(400);
    expect(result.message).to.contain('ENOENT');
  });
});

describe('import module', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('import module command', () => {
    it('import module and use it (success)', async () => {
      let result = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result.statusCode).to.equal(200);

      // Verify that module content can be used to create data.
      result = await commandHandler.command(
        Cmd.create,
        ['cardType', 'newCardType', 'decision/workflows/decision'],
        optionsMini,
      );
      expect(result.statusCode).to.equal(200);

      // Ensure that module can be updated.
      result = await commandHandler.command(Cmd.updateModules, [], optionsMini);
      expect(result.statusCode).to.equal(200);

      // Remove the module so that it won't affect other tests
      await commandHandler.command(
        Cmd.remove,
        ['module', 'decision'],
        optionsMini,
      );
    });
    it('create empty project and import two modules', async () => {
      const prefix = 'proj';
      const name = 'test-project';
      const projectDir = join(testDir, name);
      const testOptions: CardsOptions = { projectPath: projectDir };
      await commandHandler
        .command(Cmd.create, ['project', name, prefix], testOptions)
        .then(async (data) => {
          expect(data.statusCode).to.equal(200);
          let result = await commandHandler.command(
            Cmd.import,
            ['module', decisionRecordsPath],
            testOptions,
          );
          expect(result.statusCode).to.equal(200);
          result = await commandHandler.command(
            Cmd.import,
            ['module', minimalPath],
            testOptions,
          );
          expect(result.statusCode).to.equal(200);
          result = await commandHandler.command(
            Cmd.updateModules,
            [],
            testOptions,
          );
          expect(result.statusCode).to.equal(200);
          result = await commandHandler.command(
            Cmd.show,
            ['modules'],
            testOptions,
          );
          expect(result.statusCode).to.equal(200);
          if (result.payload) {
            const modules = Object.values(result.payload);
            expect(modules.length).to.equal(2);
            expect(modules).to.contain('mini');
            expect(modules).to.contain('decision');
          }
        });
    }).timeout(10000);
    it('try to import module - no source', async () => {
      const stubProjectPath = sinon
        .stub(commandHandler, 'setProjectPath')
        .resolves('path');
      const result = await commandHandler.command(
        Cmd.import,
        ['module', ''],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
      stubProjectPath.restore();
    });
    it('try to import module - no destination', async () => {
      const stubProjectPath = sinon
        .stub(commandHandler, 'setProjectPath')
        .resolves('path');
      const invalidOptions = { projectPath: '' };
      await expect(
        commandHandler.command(
          Cmd.import,
          ['module', decisionRecordsPath],
          invalidOptions,
        ),
      ).to.eventually.deep.equal({
        statusCode: 400,
        message: "Input validation error: cannot find project ''",
      });
      stubProjectPath.restore();
    });
    it('try to import module - twice the same module', async () => {
      const result1 = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result1.statusCode).to.equal(200);
      const result2 = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result2.statusCode).to.equal(400);
    });
    it('try to import module - that has the same prefix', async () => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove imported module', async () => {
      // todo: to implement
    });
  });

  describe('modifying imported module content is forbidden', () => {
    beforeEach(async () => {
      await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        options,
      );
      await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
    });
    it('try to add card to module template', async () => {
      const templateName = 'mini/templates/test-template';
      const cardType = 'decision/cardTypes/decision';
      const cardKey = '';
      const result = await commandHandler.command(
        Cmd.add,
        [templateName, cardType, cardKey],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to add child card to a module card', async () => {
      const templateName = 'decision/templates/decision';
      const cardType = 'decision/cardTypes/decision';
      const cardKey = 'decision_2';
      // try to add new card to decision_2 when 'decision-records' has been imported to 'minimal'
      const result = await commandHandler.command(
        Cmd.add,
        [templateName, cardType, cardKey],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to create attachment to a module card', async () => {
      const attachmentPath = join(testDir, 'attachments/the-needle.heic');
      const cardKey = 'decision_2';
      const result = await commandHandler.command(
        Cmd.create,
        ['attachment', cardKey, attachmentPath],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });

    it('try to move a module card to another template', async () => {
      const moduleCardKey = 'decision_2';
      const templateCardKey = 'decision_1';
      const result = await commandHandler.command(
        Cmd.move,
        [templateCardKey, moduleCardKey, 'root'],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove card from a module template', async () => {
      const cardKey = 'decision_2';
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardKey],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove cardType from a module', async () => {
      const cardType = 'decision/cardTypes/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['cardType', cardType],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove fieldType from a module', async () => {
      const fieldType = 'decision/fieldTypes/finished';
      const result = await commandHandler.command(
        Cmd.remove,
        ['fieldType', fieldType],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove report from a module', async () => {
      const report = 'decision/reports/testReport';
      const result = await commandHandler.command(
        Cmd.remove,
        ['report', report],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove template from a module', async () => {
      const template = 'decision/templates/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', template],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove workflow from a module', async () => {
      const workflow = 'decision/workflows/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflow],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove attachment from a module card', async () => {
      const cardKey = 'decision_1';
      const attachment = 'the-needle.heic';
      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardKey, attachment],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
  });
});
