// testing
import { assert, expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { copyDir } from '../src/utils/file-utils.js';
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { Show } from '../src/show.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-import-tests');
const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');
const optionsMini: CardsOptions = { projectPath: minimalPath };
const options: CardsOptions = { projectPath: decisionRecordsPath };
const commandHandler: Commands = new Commands();

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

    const show = new Show();
    const card1 = await show.showCardDetails(
      options.projectPath || '',
      { metadata: true, content: true },
      key1,
    );
    const card2 = await show.showCardDetails(
      options.projectPath || '',
      { metadata: true, content: true },
      key2,
    );
    expect(card1.metadata?.title).to.equal('Title1');
    expect(card1.content).to.equal('content1');
    expect(card1.metadata?.labels).to.deep.equal(['label1', 'label2']);
    expect(card1.metadata?.['decision/fieldTypes/responsible']).to.equal(
      'responsible@email.com',
    );
    expect(card1.metadata?.doesnotexist).to.equal(undefined);
    expect(card2.metadata?.title).to.equal('Title2');
    expect(card2.content).to.equal('content2');
    expect(card2.metadata?.labels).to.equal(undefined);
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

    const show = new Show();

    const parentCard = await show.showCardDetails(
      options.projectPath || '',
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
  const type = 'module';
  const miniModule = 'mini';
  const decisionModule = 'decision';

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Ensure that previous imports are removed.
    await commandHandler.command(Cmd.remove, [type, miniModule], options);
    await commandHandler.command(
      Cmd.remove,
      [type, decisionModule],
      optionsMini,
    );
  });

  describe('import module command', () => {
    it('import module (success)', async () => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('create empty project and import module', async () => {
      const prefix = 'proj';
      const name = 'test-project';
      const projectDir = join(testDir, name);
      const testOptions: CardsOptions = { projectPath: projectDir };
      await commandHandler
        .command(Cmd.create, ['project', name, prefix], testOptions)
        .then(async (data) => {
          expect(data.statusCode).to.equal(200);
          const result = await commandHandler.command(
            Cmd.import,
            ['module', decisionRecordsPath],
            testOptions,
          );
          expect(result.statusCode).to.equal(200);
        });
    });
    it('try to import module - no source', async () => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', ''],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to import module - no destination', async () => {
      let result = { statusCode: 0 };
      const invalidOptions = { projectPath: '' };
      try {
        result = await commandHandler.command(
          Cmd.import,
          ['module', decisionRecordsPath],
          invalidOptions,
        );
        assert(false, 'this should not be reached as the above throws');
      } catch (error) {
        if (error instanceof Error) {
          // this block is here for linter
        }
      }
      expect(result.statusCode).to.equal(0);
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
    it('try to add card to module template', async () => {
      const templateName = 'minimal';
      const cardType = 'decision/cardTypes/decision';
      const cardKey = '';
      const result = await commandHandler.command(
        Cmd.add,
        [templateName, cardType, cardKey],
        options,
      );
      // todo: the reason why this fails is due to a bug where templates with names without module
      //       name are the same (one local, one imported)
      expect(result.statusCode).to.equal(400);
    });
    it('try to add child card to a module card', async () => {
      const templateName = 'decision';
      const cardType = 'decision/cardTypes/decision';
      const cardKey = 'decision_2';
      // try to add new card to decision_2 when 'decision-records' has been imported to 'minimal'
      const result = await commandHandler.command(
        Cmd.add,
        [templateName, cardType, cardKey],
        optionsMini,
      );
      // todo: the reason why this fails is due to a bug where templates with names without module
      //       name are the same (one local, one imported)
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
      const cardKey = 'decision_2';
      const result = await commandHandler.command(
        Cmd.move,
        ['attachment', cardKey, 'root'],
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
    it('try to remove template from a module', async () => {
      const template = 'decision/templates/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', template],
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
