// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { Show } from '../src/show.js';
import { errorFunction } from '../src/utils/log-utils.js';
import { moduleSettings } from '../src/interfaces/project-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';

// validation tests do not modify the content - so they can use the original files
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-show-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };
const optionsMini: CardsOptions = { projectPath: minimalPath };

describe('shows command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('shows command', () => {
    it('show attachments - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('show attachment file', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const showCommand = new Show();
      const result = await showCommand.showAttachment(
        decisionRecordsPath,
        'decision_1',
        'the-needle.heic',
      );
      expect(result).to.not.equal(null);
      expect(result.fileBuffer).to.not.equal(null);
      expect(result.mimeType).to.equal('image/heic');
    });
    it('show attachment file, card not found', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const showCommand = new Show();
      await showCommand
        .showAttachment(
          decisionRecordsPath,
          'invalid_key',
          'does-not-exist.png',
        )
        .catch((error) =>
          expect(errorFunction(error)).to.equal(
            `Card 'invalid_key' does not exist in the project`,
          ),
        );
    });
    it('show attachment file, file not found', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const showCommand = new Show();
      await showCommand
        .showAttachment(decisionRecordsPath, 'decision_1', 'does-not-exist.png')
        .catch((error) =>
          expect(errorFunction(error)).to.equal(
            `Attachment 'does-not-exist.png' not found for card decision_1`,
          ),
        );
    });
    it('show cards - success()', async () => {
      const result = await commandHandler.command(Cmd.show, ['cards'], options);
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).to.be.greaterThan(1); //project + templates
        const cards = payloadAsArray.map((item) => item.cards);
        expect(cards.length).to.be.greaterThan(1);
        expect(cards.at(0)).to.include('decision_5');
      }
    });
    it('show particular card - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_5'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show particular card additional details - success()', async () => {
      options.details = true;
      const result = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_5'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
        const children = Object(result.payload)['children'];
        expect(children.length).to.equal(1);
      }
    });
    it('show cardtypes - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardtypes'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).to.equal(2);
        expect(payloadAsArray.at(0)).to.equal(
          'decision/cardtypes/decision-cardtype.json',
        );
        expect(payloadAsArray.at(1)).to.equal(
          'decision/cardtypes/simplepage-cardtype.json',
        );
      }
    });
    it('show particular cardtype - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardtypes', 'decision/cardtypes/decision-cardtype'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show modules (none) - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['modules'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
        const modules = Object.values(result.payload);
        expect(modules.length).to.equal(0);
      }
    });
    it('show project - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['project'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show templates - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['templates'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).to.equal(3);
        expect(payloadAsArray.at(0)).to.equal('decision/templates/decision');
        expect(payloadAsArray.at(1)).to.equal('decision/templates/empty');
        expect(payloadAsArray.at(2)).to.equal('decision/templates/simplepage');
      }
    });
    it('show particular template - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['template', 'decision/templates/decision'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show template cards - success()', async () => {
      const result = await commandHandler.command(Cmd.show, ['cards'], options);
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).to.equal(4); // project + templates
        const cards = payloadAsArray.map((item) => item.cards);
        expect(cards.at(0)).to.include('decision_5');
      }
    });
    it('show workflows - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['workflows'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).to.equal(2);
        expect(payloadAsArray.at(0)).to.equal(
          'decision/workflows/decision-workflow.json',
        );
        expect(payloadAsArray.at(1)).to.equal(
          'decision/workflows/simple-workflow.json',
        );
      }
    });
    it('show particular workflow - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['workflow', 'decision/workflows/decision-workflow'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    // @todo add test cases for error situations
  });

  describe('show command with modules', () => {
    beforeEach(async () => {
      // import each project to each other
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

    afterEach(async () => {
      // Ensure that previous imports are removed.
      await commandHandler.command(
        Cmd.remove,
        ['module', minimalPath],
        options,
      );
      await commandHandler.command(
        Cmd.remove,
        ['module', decisionRecordsPath],
        optionsMini,
      );
    });

    it('show modules - success', async () => {
      let result = await commandHandler.command(Cmd.show, ['modules'], options);
      expect(result.statusCode).to.equal(200);
      expect(result.payload!).to.not.equal(undefined);
      let modules = Object.values(result.payload!);
      expect(modules.at(0)).to.equal('mini');
      result = await commandHandler.command(Cmd.show, ['modules'], optionsMini);
      expect(result.payload).to.not.equal(undefined);
      modules = Object.values(result.payload!);
      expect(modules.at(0)).to.equal('decision');
    });
    it('show particular module - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['module', 'mini'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      expect(result.payload).to.not.equal(undefined);
      const module = result.payload as moduleSettings;
      expect(module.cardkeyPrefix).to.equal('mini');
      expect(module.name).to.equal('minimal');
      expect(module.path).to.equal(
        join(decisionRecordsPath, '.cards', 'modules', 'mini'),
      );
      expect(module.cardtypes).to.include('mini/cardtypes/myCardtype.json');
      expect(module.templates).to.include('mini/templates/test-template');
      expect(module.workflows).to.include(
        'mini/workflows/defaultWorkflow.json',
      );
      expect(module.workflows).to.include(
        'mini/workflows/minimimal-workflow.json',
      );
    });
    it('show particular card', async () => {
      // Since projects have been imported to each other, all cards can be found from each.
      const result = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_1'],
        options,
      );
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_1'],
        optionsMini,
      );
      expect(result.statusCode).to.equal(200);
      expect(result.payload).to.not.equal(undefined);
      expect(resultFromModule.statusCode).to.equal(200);
      expect(resultFromModule.payload).to.not.equal(undefined);
    });
    it('show cards', async () => {
      const result = await commandHandler.command(Cmd.show, ['cards'], options);
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['cards'],
        optionsMini,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.be.greaterThan(1); //project + templates
      let cards = payloadAsArray.map((item) => item.cards);
      expect(cards.length).to.be.greaterThan(1);
      expect(cards.at(0)).to.include('decision_5');
      expect(resultFromModule.statusCode).to.equal(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).to.be.greaterThan(1); //project + templates
      cards = payloadAsArray.map((item) => item.cards);
      expect(cards.length).to.be.greaterThan(1);
      expect(cards.at(cards.length - 1)).to.include('decision_2');
    });
    it('show cardtypes', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardtypes'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(3);
      expect(payloadAsArray.at(0)).to.equal(
        'decision/cardtypes/decision-cardtype.json',
      );
      expect(payloadAsArray.at(1)).to.equal(
        'decision/cardtypes/simplepage-cardtype.json',
      );
      expect(payloadAsArray.at(2)).to.equal('mini/cardtypes/myCardtype.json');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['cardtypes'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).to.equal(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).to.equal(3);
      expect(payloadAsArray.at(0)).to.equal(
        'decision/cardtypes/decision-cardtype.json',
      );
      expect(payloadAsArray.at(1)).to.equal(
        'decision/cardtypes/simplepage-cardtype.json',
      );
      expect(payloadAsArray.at(2)).to.equal('mini/cardtypes/myCardtype.json');
    });
    it('show templates', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['templates'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0)).to.equal('decision/templates/decision');
      expect(payloadAsArray.at(1)).to.equal('decision/templates/empty');
      expect(payloadAsArray.at(2)).to.equal('decision/templates/simplepage');
      expect(payloadAsArray.at(3)).to.equal('mini/templates/test-template');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['templates'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).to.equal(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0)).to.equal('decision/templates/decision');
      expect(payloadAsArray.at(1)).to.equal('decision/templates/empty');
      expect(payloadAsArray.at(2)).to.equal('decision/templates/simplepage');
      expect(payloadAsArray.at(3)).to.equal('mini/templates/test-template');
    });
    it('show workflows', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['workflows'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0)).to.equal(
        'decision/workflows/decision-workflow.json',
      );
      expect(payloadAsArray.at(1)).to.equal(
        'decision/workflows/simple-workflow.json',
      );
      expect(payloadAsArray.at(2)).to.equal(
        'mini/workflows/defaultWorkflow.json',
      );
      expect(payloadAsArray.at(3)).to.equal(
        'mini/workflows/minimimal-workflow.json',
      );
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['workflows'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).to.equal(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0)).to.equal(
        'decision/workflows/decision-workflow.json',
      );
      expect(payloadAsArray.at(1)).to.equal(
        'decision/workflows/simple-workflow.json',
      );
      expect(payloadAsArray.at(2)).to.equal(
        'mini/workflows/defaultWorkflow.json',
      );
      expect(payloadAsArray.at(3)).to.equal(
        'mini/workflows/minimimal-workflow.json',
      );
    });
    it('show attachments', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(2);
      expect(payloadAsArray.at(0).card).to.equal('decision_5');
      expect(payloadAsArray.at(0).fileName).to.equal('games.jpg');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).to.equal(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).to.equal(1);
      expect(payloadAsArray.at(0).card).to.equal('decision_1');
      expect(payloadAsArray.at(0).fileName).to.equal('the-needle.heic');
    });
  });
});
