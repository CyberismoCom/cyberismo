// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { Cmd, Commands, CommandManager } from '../src/command-handler.js';
import { copyDir, writeFileSafe } from '../src/utils/file-utils.js';
import { errorFunction } from '../src/utils/error-utils.js';
import { Project } from '../src/containers/project.js';
import { resourceName } from '../src/resources/file-resource.js';
import { ReportResource } from '../src/resources/report-resource.js';
import { Show } from '../src/commands/index.js';
import { writeJsonFile } from '../src/utils/json.js';
import type {
  FetchCardDetails,
  ModuleContent,
} from '../src/interfaces/project-interfaces.js';
import type { ShowCommandOptions } from '../src/interfaces/command-options.js';

// validation tests do not modify the content - so they can use the original files
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-show-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const optionsDecision: ShowCommandOptions = {
  projectPath: decisionRecordsPath,
};
const optionsMini: ShowCommandOptions = { projectPath: minimalPath };

describe('shows command', () => {
  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('show command', () => {
    it('show attachments - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('show attachment file', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const project = new Project(decisionRecordsPath);
      const showCommand = new Show(project);
      const result = await showCommand.showAttachment(
        'decision_1',
        'the-needle.heic',
      );
      expect(result).to.not.equal(null);
      expect(result.fileBuffer).to.not.equal(null);
      expect(result.mimeType).to.equal('image/heic');
    });
    it('show attachment file, card not found', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const project = new Project(decisionRecordsPath);
      const showCommand = new Show(project);
      await showCommand
        .showAttachment('invalid_key', 'does-not-exist.png')
        .catch((error) =>
          expect(errorFunction(error)).to.equal(
            `Card 'invalid_key' does not exist in the project`,
          ),
        );
    });
    it('show attachment file, file not found', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const project = new Project(decisionRecordsPath);
      const showCommand = new Show(project);
      await showCommand
        .showAttachment('decision_1', 'does-not-exist.png')
        .catch((error) =>
          expect(errorFunction(error)).to.equal(
            `Attachment 'does-not-exist.png' not found for card decision_1`,
          ),
        );
    });
    it('show cards - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cards'],
        optionsDecision,
      );
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
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show particular card additional details - success()', async () => {
      optionsDecision.details = true;
      const result = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_5'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
        const children = Object(result.payload)['children'];
        expect(children.length).to.equal(1);
      }
    });
    it('show cardTypes - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardTypes'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).to.equal(2);
        expect(payloadAsArray.at(0)).to.equal('decision/cardTypes/decision');
        expect(payloadAsArray.at(1)).to.equal('decision/cardTypes/simplepage');
      }
    });
    it('show particular card type - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardTypes', 'decision/cardTypes/decision'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show particular card type with name only', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['decision/cardTypes/decision'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show particular card type with usage', async () => {
      optionsDecision.showUse = true;
      const result = await commandHandler.command(
        Cmd.show,
        ['decision/cardTypes/decision'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
        expect(result.payload).to.haveOwnProperty('usedIn');
      } else {
        expect(false).to.equal(true);
      }
    });
    it('show hubs - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['hubs'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('shows labels - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['labels'],
        optionsDecision,
      );
      expect(result.payload).to.deep.equal([
        'test',
        'test-two',
        'template-test-label',
      ]);
    });
    it('show modules (none) - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['modules'],
        optionsDecision,
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
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show reports - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['reports'],
        optionsDecision,
      );
      const payloadAsArray = Object.values(result.payload || []);
      expect(result.statusCode).to.equal(200);
      expect(payloadAsArray.length).to.equal(2);
      expect(payloadAsArray[0]).to.equal('decision/reports/anotherReport');
      expect(payloadAsArray[1]).to.equal('decision/reports/testReport');
    });
    it('show templates - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['templates'],
        optionsDecision,
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
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        expect(result.payload).to.not.equal(undefined);
      }
    });
    it('show template cards - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cards'],
        optionsDecision,
      );
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
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).to.equal(2);
        expect(payloadAsArray.at(0)).to.equal('decision/workflows/decision');
        expect(payloadAsArray.at(1)).to.equal('decision/workflows/simple');
      }
    });
    it('show particular workflow - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['workflow', 'decision/workflows/decision'],
        optionsDecision,
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
        optionsDecision,
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
        optionsDecision,
      );
      await commandHandler.command(
        Cmd.remove,
        ['module', decisionRecordsPath],
        optionsMini,
      );
    });

    it('show modules - success', async () => {
      let result = await commandHandler.command(
        Cmd.show,
        ['modules'],
        optionsDecision,
      );
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
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      expect(result.payload).to.not.equal(undefined);
      const module = result.payload as ModuleContent;
      expect(module.cardKeyPrefix).to.equal('mini');
      expect(module.name).to.equal('minimal');
      expect(module.path).to.equal(
        join(decisionRecordsPath, '.cards', 'modules', 'mini'),
      );
      expect(module.cardTypes).to.include('mini/cardTypes/myCardtype');
      expect(module.templates).to.include('mini/templates/test-template');
      expect(module.workflows).to.include('mini/workflows/default');
      expect(module.workflows).to.include('mini/workflows/minimal');
    });
    it('show particular card', async () => {
      // Since projects have been imported to each other, all cards can be found from each.
      const result = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_1'],
        optionsDecision,
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
      const result = await commandHandler.command(
        Cmd.show,
        ['cards'],
        optionsDecision,
      );
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
    it('show cardTypes', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardTypes'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(3);
      expect(payloadAsArray.at(0)).to.equal('decision/cardTypes/decision');
      expect(payloadAsArray.at(1)).to.equal('decision/cardTypes/simplepage');
      expect(payloadAsArray.at(2)).to.equal('mini/cardTypes/myCardtype');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['cardTypes'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).to.equal(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).to.equal(3);
      expect(payloadAsArray.at(0)).to.equal('decision/cardTypes/decision');
      expect(payloadAsArray.at(1)).to.equal('decision/cardTypes/simplepage');
      expect(payloadAsArray.at(2)).to.equal('mini/cardTypes/myCardtype');
    });
    it('show templates', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['templates'],
        optionsDecision,
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
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0)).to.equal('decision/workflows/decision');
      expect(payloadAsArray.at(1)).to.equal('decision/workflows/simple');
      expect(payloadAsArray.at(2)).to.equal('mini/workflows/default');
      expect(payloadAsArray.at(3)).to.equal('mini/workflows/minimal');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['workflows'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).to.equal(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0)).to.equal('decision/workflows/decision');
      expect(payloadAsArray.at(1)).to.equal('decision/workflows/simple');
      expect(payloadAsArray.at(2)).to.equal('mini/workflows/default');
      expect(payloadAsArray.at(3)).to.equal('mini/workflows/minimal');
    });
    it('show attachments', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        optionsDecision,
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
  describe('show importable modules', () => {
    beforeEach(async () => {
      // add default hub
      await commandHandler.command(
        Cmd.add,
        [
          'hub',
          'https://raw.githubusercontent.com/CyberismoCom/cyberismo/main/tools/assets/src/hub/',
        ],
        optionsDecision,
      );
      const fetchResult = await commandHandler.command(
        Cmd.fetch,
        ['hubs'],
        optionsDecision,
      );
      expect(fetchResult.statusCode, 'BeforeEach fetch failed').to.equal(200);
      const result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      const modules = Object.values(result.payload!);
      if (modules.length === 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });

    afterEach(async () => {
      // remove hub
      await commandHandler.command(
        Cmd.remove,
        [
          'hub',
          'https://raw.githubusercontent.com/CyberismoCom/cyberismo/main/tools/assets/src/hub/',
        ],
        optionsDecision,
      );
    });

    it('show importable modules - success()', async () => {
      optionsDecision.details = false;
      const result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      const payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0)).to.equal('base');
      expect(payloadAsArray.at(1)).to.equal('eucra');
      expect(payloadAsArray.at(2)).to.equal('ismsa');
      expect(payloadAsArray.at(3)).to.equal('secdeva');
    });

    it('show importable modules details - success()', async () => {
      optionsDecision.details = true;
      const result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      const payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).to.equal(4);
      expect(payloadAsArray.at(0).name).to.equal('base');
      expect(payloadAsArray.at(1).name).to.equal('eucra');
      expect(payloadAsArray.at(2).name).to.equal('ismsa');
      expect(payloadAsArray.at(3).name).to.equal('secdeva');
      expect(payloadAsArray.at(0).category).to.equal('essentials');
      expect(payloadAsArray.at(1).category).to.equal('essentials');
      expect(payloadAsArray.at(2).category).to.equal('essentials');
      expect(payloadAsArray.at(3).category).to.equal('essentials');
    });

    it('show importableModule all - success()', async () => {
      optionsDecision.details = true;
      let result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      let payloadAsArray = Object.values(result.payload!);
      // initially, all modules from hub are importable
      expect(payloadAsArray.length).to.equal(4);

      // Convert SSH URL to HTTPS URL for CI compatibility
      let baseModuleLocation = payloadAsArray.at(0).location;
      if (baseModuleLocation.startsWith('git@github.com:')) {
        baseModuleLocation = baseModuleLocation.replace(
          'git@github.com:',
          'https://github.com/',
        );
      }

      // import 'base'
      const res = await commandHandler.command(
        Cmd.import,
        ['module', baseModuleLocation],
        optionsDecision,
      );

      expect(res.statusCode, 'Importing "base" failed').to.equal(200);
      result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      payloadAsArray = Object.values(result.payload!);
      // then, importable module count goes down by one
      expect(payloadAsArray.length).to.equal(3);
      optionsDecision.showAll = true;
      result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).to.equal(200);
      payloadAsArray = Object.values(result.payload!);
      // all modules are still contain 'base'
      expect(payloadAsArray.length).to.equal(4);
    }).timeout(30000);
  });
});

describe('show', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-show-tests');
  mkdirSync(testDir, { recursive: true });
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let showCmd: Show;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath);
    showCmd = commands.showCmd;
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('showAttachments (success)', async () => {
    const results = await showCmd.showAttachments();
    expect(results).to.not.equal(undefined);
  });
  it('showAttachment (success)', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'the-needle.heic';
    const results = await showCmd.showAttachment(cardId, attachmentName);
    expect(results).to.not.equal(undefined);
  });
  it('showAttachment - empty card key', async () => {
    const cardId = '';
    const attachmentName = 'the-needle.heic';
    await showCmd
      .showAttachment(cardId, attachmentName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Mandatory parameter 'cardKey' missing`,
        ),
      );
  });
  it('showAttachment - card does not have particular attachment', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'i-dont-exist';
    await showCmd
      .showAttachment(cardId, attachmentName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Attachment 'i-dont-exist' not found for card decision_1`,
        ),
      );
  });
  it('showCardDetails (success)', async () => {
    const cardId = 'decision_1';
    const details: FetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    const results = await showCmd.showCardDetails(details, cardId);
    expect(results).to.not.equal(undefined);
  });
  it('showCardDetails - empty card key', async () => {
    const cardId = '';
    const details: FetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    await showCmd
      .showCardDetails(details, cardId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Mandatory parameter 'cardKey' missing`,
        ),
      );
  });
  it('showCardDetails - card not in project', async () => {
    const cardId = 'decision_999';
    const details: FetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    await showCmd
      .showCardDetails(details, cardId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Card 'decision_999' does not exist in the project`,
        ),
      );
  });
  it('showCardDetails - empty attachment folder', async () => {
    const details: FetchCardDetails = {
      content: false,
      metadata: true,
      attachments: true,
    };
    const cardRoot = join(decisionRecordsPath, 'cardRoot');
    // First create a test setup where there is a parent and child cards.
    // Parent has empty attachment folder, child has attachment in attachment folder.
    // Use just filesystem operations to create the setup.
    const cardMetadata = {
      title: 'A title',
      cardType: 'decision/cardTypes/decision',
      workflowState: 'Approved',
    };
    // Parent
    const cardIdParent = 'decision_my_card';
    await writeFileSafe(join(cardRoot, cardIdParent, 'index.adoc'), '');
    const parentWrite = await writeJsonFile(
      join(cardRoot, cardIdParent, 'index.json'),
      cardMetadata,
    );
    expect(parentWrite).to.equal(true);
    mkdirSync(join(decisionRecordsPath, 'cardRoot', cardIdParent, 'a'));

    // Child
    const cardIChild = 'decision_child';
    await writeFileSafe(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'index.adoc'),
      '',
    );
    const childWrite = await writeJsonFile(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'index.json'),
      cardMetadata,
    );
    expect(childWrite).to.equal(true);
    await writeFileSafe(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'a', 'image.png'),
      '',
    );

    // Expect that parent has no attachments.
    const parentResult = await showCmd.showCardDetails(details, cardIdParent);
    expect(parentResult.attachments.length).equals(0);

    // Child must have one attachment that is owned by the child.
    const childResult = await showCmd.showCardDetails(details, cardIChild);
    expect(childResult.attachments.length).equals(1);
    const childAttachment = childResult.attachments.at(0);
    expect(childAttachment?.card).equals(cardIChild);

    rmSync(join(cardRoot, cardIdParent), { recursive: true, force: true });
  });
  it('showCards (success)', async () => {
    const results = await showCmd.showCards();
    expect(results).to.not.equal(undefined);
  });
  it('showProjectCards (success)', async () => {
    const results = await showCmd.showProjectCards();
    expect(results).to.not.equal(undefined);
  });
  it('showResource - card type (success)', async () => {
    const cardType = 'decision/cardTypes/decision';
    const results = await showCmd.showResource(cardType);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - empty cardType', async () => {
    const cardType = '';
    await showCmd
      .showResource(cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define resource name to query its details`,
        ),
      );
  });
  it('showResource - card type does not exist in project', async () => {
    const cardType = 'decision/cardTypes/my-card-type';
    await showCmd
      .showResource(cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `CardType '${cardType}' does not exist in the project`,
        ),
      );
  });
  it('showCardTypesWithDetails (success)', async () => {
    const results = await showCmd.showCardTypesWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('showResource - field type (success)', async () => {
    const fieldTypeName = 'decision/fieldTypes/obsoletedBy';
    const results = await showCmd.showResource(fieldTypeName);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - field type does not exist', async () => {
    const fieldTypeName = 'decision/fieldTypes/i-do-not-exist';
    await showCmd
      .showResource(fieldTypeName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `FieldType '${fieldTypeName}' does not exist in the project`,
        ),
      );
  });
  it('showResource - link type (success)', async () => {
    const fieldTypeName = 'decision/linkTypes/test';
    const results = await showCmd.showResource(fieldTypeName);
    expect(results).to.not.equal(undefined);
  });
  it('try showResource - link type does not exist', async () => {
    const linkTypeName = 'decision/linkTypes/i-do-not-exist';
    await showCmd
      .showResource(linkTypeName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `LinkType '${linkTypeName}' does not exist in the project`,
        ),
      );
  });
  it('showModule - no module name defined', async () => {
    const moduleName = '';
    await showCmd
      .showModule(moduleName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Module '' does not exist in the project`,
        ),
      );
  });
  it('showModules (success)', async () => {
    const results = await showCmd.showModules();
    expect(results).to.not.equal(undefined);
  });
  it('showProject (success)', async () => {
    const results = await showCmd.showProject();
    expect(results).to.not.equal(undefined);
  });
  it('showResource - template (success)', async () => {
    const templateName = 'decision/templates/decision';
    const results = await showCmd.showResource(templateName);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - template with no name', async () => {
    const templateName = '';
    await showCmd
      .showResource(templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define resource name to query its details`,
        ),
      );
  });
  it('showResource - template does not exist in project', async () => {
    const templateName = 'i-do-not-exist';
    await showCmd
      .showResource(templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Name '${templateName}' is not valid resource name`,
        ),
      );
  });
  it('showResources - valid types', async () => {
    const validResourceTypes = [
      'cardTypes',
      'fieldTypes',
      'graphViews',
      'graphModels',
      'linkTypes',
      'reports',
      'templates',
      'workflows',
    ];
    for (const type of validResourceTypes) {
      const results = await showCmd.showResources(type);
      expect(results).to.not.equal(undefined);
    }
  });
  it('showResources - invalid type', async () => {
    const validResourceTypes = ['unknown'];
    for (const type of validResourceTypes) {
      const results = await showCmd.showResources(type);
      expect(results.length).to.equal(0);
    }
  });
  it('showTemplatesWithDetails (success)', async () => {
    const results = await showCmd.showTemplatesWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('showResource - workflow (success)', async () => {
    const workflowName = 'decision/workflows/decision';
    const results = await showCmd.showResource(workflowName);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - empty workflow name', async () => {
    const workflowName = '';
    await showCmd
      .showResource(workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define resource name to query its details`,
        ),
      );
  });
  it('showResource - workflow does not exist in project', async () => {
    const workflowName = 'decision/workflows/i-do-not-exist';
    await showCmd
      .showResource(workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Workflow '${workflowName}' does not exist in the project`,
        ),
      );
  });
  it('showWorkflowsWithDetails (success)', async () => {
    const results = await showCmd.showWorkflowsWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('show report results', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await commands.project.calculationEngine.generate();
    const results = await showCmd.showReportResults(
      parameters.name,
      parameters.parameters.cardKey,
      parameters,
      'localApp',
    );
    expect(results).to.not.equal(undefined);
    expect(results).to.include('xref');
  });
  it('show report results - results to a file', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await commands.project.calculationEngine.generate();
    const results = await showCmd.showReportResults(
      parameters.name,
      parameters.parameters.cardKey,
      parameters,
      'localApp',
      join(testDir, 'report-results.txt'),
    );
    expect(results).equal('');
    const fileContent = await readFile(join(testDir, 'report-results.txt'));
    expect(fileContent.toString()).to.include('xref');
  });
  it('show report results - results to a file', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await commands.project.calculationEngine.generate();
    const results = await showCmd.showReportResults(
      parameters.name,
      parameters.parameters.cardKey,
      parameters,
      'localApp',
      join(testDir, 'report-results.txt'),
    );
    expect(results).equal('');
    const fileContent = await readFile(join(testDir, 'report-results.txt'));
    expect(fileContent.toString()).to.include('xref');
  });
  it('try show report results - report does not exist', async () => {
    const parameters = {
      name: 'decision/reports/wrongReport',
      parameters: {
        wrongKey: 'blaah',
      },
    };
    await commands.project.calculationEngine.generate();
    await expect(
      showCmd.showReportResults(
        parameters.name,
        'wrong',
        parameters,
        'localApp',
      ),
    ).to.be.rejectedWith(
      `Report 'decision/reports/wrongReport' does not exist`,
    );
  });

  it('showFile (success)', async () => {
    // TODO: Test to be renamed and moved to resource tests once showFile has been removed
    const resourceNameStr = 'decision/reports/anotherReport';
    const res = new ReportResource(
      commands.project,
      resourceName(resourceNameStr),
    );
    const result = (await res.show()).content.contentTemplate;
    expect(result).to.not.equal(undefined);
    expect(result).to.be.a('string');
    expect(result.length).to.be.greaterThan(0);
  });

  it('showFile - resource does not exist', async () => {
    // TODO: Test to be removed once showFile has been removed
    const resourceNameStr = 'decision/reports/nonExistentReport';
    const fileName = 'index.adoc.hbs';
    await showCmd
      .showFile(resourceName(resourceNameStr), fileName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' does not exist in the project`,
        ),
      );
  });

  it('showFile - resource is not a folder resource', async () => {
    // TODO: Test to be removed once showFile has been removed
    const resourceNameStr = 'decision/cardTypes/decision';
    const fileName = 'some-file.txt';
    await showCmd
      .showFile(resourceName(resourceNameStr), fileName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' is not a folder resource`,
        ),
      );
  });

  it('showFile - file does not exist in resource', async () => {
    // TODO: Test to be removed once showFile has been removed
    const resourceNameStr = 'decision/reports/anotherReport';
    const fileName = 'nonExistentFile.txt';
    await showCmd
      .showFile(resourceName(resourceNameStr), fileName)
      .catch((error) => {
        expect(error.code).to.equal('ENOENT');
      });
  });

  it('showFileNames (success)', async () => {
    const resourceNameStr = 'decision/reports/anotherReport';
    const result = await showCmd.showFileNames(resourceName(resourceNameStr));
    expect(result).to.not.equal(undefined);
    expect(result).to.be.an('array');
    expect(result).to.include('index.adoc.hbs');
    expect(result).to.include('parameterSchema.json');
    expect(result).to.include('query.lp.hbs');
    expect(result.length).to.equal(3);
  });

  it('showFileNames - resource does not exist', async () => {
    const resourceNameStr = 'decision/reports/nonExistentReport';
    await showCmd
      .showFileNames(resourceName(resourceNameStr))
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' does not exist in the project`,
        ),
      );
  });

  it('showFileNames - resource is not a folder resource', async () => {
    const resourceNameStr = 'decision/cardTypes/decision';
    await showCmd
      .showFileNames(resourceName(resourceNameStr))
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' is not a folder resource`,
        ),
      );
  });

  it('showFileNames - empty folder resource', async () => {
    const resourceNameStr = 'decision/templates/empty';
    const result = await showCmd.showFileNames(resourceName(resourceNameStr));
    expect(result).to.not.equal(undefined);
    expect(result).to.be.an('array');
    expect(result.length).to.equal(0);
  });

  it('showCardLogicProgram (success)', async () => {
    const cardKey = 'decision_1';
    const result = await showCmd.showCardLogicProgram(cardKey);
    expect(result).to.not.equal(undefined);
    expect(result).to.be.a('string');
  });

  it('showCardLogicProgram - card does not exist', async () => {
    const cardKey = 'nonexistent_card';
    await showCmd
      .showCardLogicProgram(cardKey)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Card 'nonexistent_card' does not exist in the project`,
        ),
      );
  });

  it('showLogicProgram (success)', async () => {
    const resourceNameStr = 'decision/cardTypes/decision';
    const result = await showCmd.showLogicProgram(
      resourceName(resourceNameStr),
    );
    expect(result).to.not.equal(undefined);
    expect(result).to.be.a('string');
  });

  it('showLogicProgram - resource does not exist', async () => {
    const resourceNameStr = 'decision/cardTypes/nonexistent';
    await showCmd
      .showLogicProgram(resourceName(resourceNameStr))
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource 'decision/cardTypes/nonexistent' does not exist in the project`,
        ),
      );
  });
});
