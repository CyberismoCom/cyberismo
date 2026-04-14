// testing
import { expect, it, describe, beforeEach, afterEach } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { Cmd, Commands, CommandManager } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { Fetch, Show } from '../src/commands/index.js';
import { getTestBaseDir, getTestProject } from './helpers/test-utils.js';
import type { ModuleContent } from '../src/interfaces/project-interfaces.js';
import type { ShowCommandOptions } from '../src/interfaces/command-options.js';
import { CardNotFoundError } from '../src/exceptions/index.js';

// validation tests do not modify the content - so they can use the original files
const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
const testDir = join(baseDir, 'tmp-command-handler-show-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const optionsDecision: ShowCommandOptions = {
  projectPath: decisionRecordsPath,
};
const optionsMini: ShowCommandOptions = { projectPath: minimalPath };

describe('shows command', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('show command', () => {
    it('show attachments - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
    });
    it('show attachment file', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      const fetchCmd = new Fetch(project);
      const showCommand = new Show(project, fetchCmd);
      const result = await showCommand.showAttachment(
        'decision_1',
        'the-needle.heic',
      );
      expect(result).not.toBe(null);
      expect(result.fileBuffer).not.toBe(null);
      expect(result.mimeType).toBe('image/heic');
    });
    it('show attachment file, card not found', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      const fetch = new Fetch(project);
      const showCommand = new Show(project, fetch);
      await expect(
        showCommand.showAttachment('invalid_key', 'does-not-exist.png'),
      ).rejects.toThrow(CardNotFoundError);
    });
    it('show attachment file, file not found', async () => {
      // No commandHandler command for getting attachment files, so using Show directly
      const project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      const fetchCmd = new Fetch(project);
      const showCommand = new Show(project, fetchCmd);
      await expect(
        showCommand.showAttachment('decision_1', 'does-not-exist.png'),
      ).rejects.toThrow(
        `Attachment 'does-not-exist.png' not found for card decision_1`,
      );
    });
    it('show cards - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cards'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).toBeGreaterThan(1); //project + templates
        const cards = payloadAsArray.map((item) => item.cards);
        expect(cards.length).toBeGreaterThan(1);
        expect(cards.at(0)).to.include('decision_5');
      }
    });
    it('show particular card - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_5'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
      }
    });
    it('show particular card additional details - success()', async () => {
      optionsDecision.details = true;
      const result = await commandHandler.command(
        Cmd.show,
        ['card', 'decision_5'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
        const children = Object(result.payload)['children'];
        expect(children.length).toBe(1);
      }
    });
    it('show cardTypes - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardTypes'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).toBe(2);
        expect(payloadAsArray.at(0)).toBe('decision/cardTypes/decision');
        expect(payloadAsArray.at(1)).toBe('decision/cardTypes/simplepage');
      }
    });
    it('show particular card type - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardTypes', 'decision/cardTypes/decision'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
      }
    });
    it('show particular card type with name only', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['decision/cardTypes/decision'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
      }
    });
    it('show particular card type with usage', async () => {
      optionsDecision.showUse = true;
      const result = await commandHandler.command(
        Cmd.show,
        ['decision/cardTypes/decision'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
        expect(result.payload).to.haveOwnProperty('usedIn');
      } else {
        expect(false).toBe(true);
      }
    });
    it('show hubs - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['hubs'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
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
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
        const modules = result.payload as Array<{ name: string }>;
        expect(modules.length).toBe(0);
      }
    });
    it('show project - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['project'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
      }
    });
    it('show reports - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['reports'],
        optionsDecision,
      );
      const payloadAsArray = Object.values(result.payload || []);
      expect(result.statusCode).toBe(200);
      expect(payloadAsArray.length).toBe(3);
      expect(payloadAsArray[0]).toBe('decision/reports/anotherReport');
      expect(payloadAsArray[1]).toBe('decision/reports/eqNeReport');
      expect(payloadAsArray[2]).toBe('decision/reports/testReport');
    });
    it('show templates - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['templates'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).toBe(3);
        expect(payloadAsArray.at(0)).toBe('decision/templates/decision');
        expect(payloadAsArray.at(1)).toBe('decision/templates/empty');
        expect(payloadAsArray.at(2)).toBe('decision/templates/simplepage');
      }
    });
    it('show particular template - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['template', 'decision/templates/decision'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
      }
    });
    it('show template cards - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cards'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).toBe(3); // project + templates with cards (empty template excluded)
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
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        const payloadAsArray = Object.values(result.payload);
        expect(payloadAsArray.length).toBe(2);
        expect(payloadAsArray.at(0)).toBe('decision/workflows/decision');
        expect(payloadAsArray.at(1)).toBe('decision/workflows/simple');
      }
    });
    it('show particular workflow - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['workflow', 'decision/workflows/decision'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        expect(result.payload).not.toBeUndefined();
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
      expect(result.statusCode).toBe(200);
      expect(result.payload!).not.toBeUndefined();
      let modules = result.payload as Array<{ name: string }>;
      expect(modules.at(0)?.name).toBe('mini');
      result = await commandHandler.command(Cmd.show, ['modules'], optionsMini);
      expect(result.payload).not.toBeUndefined();
      modules = result.payload as Array<{ name: string }>;
      expect(modules.at(0)?.name).toBe('decision');
    });
    it('show particular module - success()', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['module', 'mini'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      expect(result.payload).not.toBeUndefined();
      const module = result.payload as ModuleContent;
      expect(module.cardKeyPrefix).toBe('mini');
      expect(module.name).toBe('minimal');
      expect(module.path).toBe(
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
      expect(result.statusCode).toBe(200);
      expect(result.payload).not.toBeUndefined();
      expect(resultFromModule.statusCode).toBe(200);
      expect(resultFromModule.payload).not.toBeUndefined();
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
      expect(result.statusCode).toBe(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).toBeGreaterThan(1); //project + templates
      let cards = payloadAsArray.map((item) => item.cards);
      expect(cards.length).toBeGreaterThan(1);
      expect(cards.at(0)).to.include('decision_5');
      expect(resultFromModule.statusCode).toBe(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).toBeGreaterThan(1); //project + templates
      cards = payloadAsArray.map((item) => item.cards);
      expect(cards.length).toBeGreaterThan(1);
      expect(cards.at(cards.length - 1)).to.include('decision_2');
    });
    it('show cardTypes', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['cardTypes'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).toBe(3);
      expect(payloadAsArray.at(0)).toBe('decision/cardTypes/decision');
      expect(payloadAsArray.at(1)).toBe('decision/cardTypes/simplepage');
      expect(payloadAsArray.at(2)).toBe('mini/cardTypes/myCardtype');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['cardTypes'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).toBe(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).toBe(3);
      expect(payloadAsArray.at(0)).toBe('decision/cardTypes/decision');
      expect(payloadAsArray.at(1)).toBe('decision/cardTypes/simplepage');
      expect(payloadAsArray.at(2)).toBe('mini/cardTypes/myCardtype');
    });
    it('show templates', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['templates'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).toBe(4);
      expect(payloadAsArray.at(0)).toBe('decision/templates/decision');
      expect(payloadAsArray.at(1)).toBe('decision/templates/empty');
      expect(payloadAsArray.at(2)).toBe('decision/templates/simplepage');
      expect(payloadAsArray.at(3)).toBe('mini/templates/test-template');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['templates'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).toBe(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).toBe(4);
      expect(payloadAsArray.at(0)).toBe('decision/templates/decision');
      expect(payloadAsArray.at(1)).toBe('decision/templates/empty');
      expect(payloadAsArray.at(2)).toBe('decision/templates/simplepage');
      expect(payloadAsArray.at(3)).toBe('mini/templates/test-template');
    });
    it('show workflows', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['workflows'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).toBe(4);
      expect(payloadAsArray.at(0)).toBe('decision/workflows/decision');
      expect(payloadAsArray.at(1)).toBe('decision/workflows/simple');
      expect(payloadAsArray.at(2)).toBe('mini/workflows/default');
      expect(payloadAsArray.at(3)).toBe('mini/workflows/minimal');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['workflows'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).toBe(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).toBe(4);
      expect(payloadAsArray.at(0)).toBe('decision/workflows/decision');
      expect(payloadAsArray.at(1)).toBe('decision/workflows/simple');
      expect(payloadAsArray.at(2)).toBe('mini/workflows/default');
      expect(payloadAsArray.at(3)).toBe('mini/workflows/minimal');
    });
    it('show attachments', async () => {
      const result = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      let payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).toBe(2);
      expect(payloadAsArray.at(0).card).toBe('decision_5');
      expect(payloadAsArray.at(0).fileName).toBe('games.jpg');
      const resultFromModule = await commandHandler.command(
        Cmd.show,
        ['attachments'],
        optionsMini,
      );
      expect(resultFromModule.statusCode).toBe(200);
      payloadAsArray = Object.values(resultFromModule.payload!);
      expect(payloadAsArray.length).toBe(1);
      expect(payloadAsArray.at(0).card).toBe('decision_1');
      expect(payloadAsArray.at(0).fileName).toBe('the-needle.heic');
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
      expect(fetchResult.statusCode, 'BeforeEach fetch failed').toBe(200);
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
      expect(result.statusCode).toBe(200);
      const payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).toBe(4);
      expect(payloadAsArray.at(0)).toBe('base');
      expect(payloadAsArray.at(1)).toBe('eucra');
      expect(payloadAsArray.at(2)).toBe('ismsa');
      expect(payloadAsArray.at(3)).toBe('secdeva');
    });

    it('show importable modules details - success()', async () => {
      optionsDecision.details = true;
      const result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      const payloadAsArray = Object.values(result.payload!);
      expect(payloadAsArray.length).toBe(4);
      expect(payloadAsArray.at(0).name).toBe('base');
      expect(payloadAsArray.at(1).name).toBe('eucra');
      expect(payloadAsArray.at(2).name).toBe('ismsa');
      expect(payloadAsArray.at(3).name).toBe('secdeva');
      expect(payloadAsArray.at(0).category).toBe('essentials');
      expect(payloadAsArray.at(1).category).toBe('essentials');
      expect(payloadAsArray.at(2).category).toBe('essentials');
      expect(payloadAsArray.at(3).category).toBe('essentials');
    });

    it('show importableModule all - success()', async () => {
      optionsDecision.details = true;
      let result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      let payloadAsArray = Object.values(result.payload!);
      // initially, all modules from hub are importable
      expect(payloadAsArray.length).toBe(4);

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

      expect(res.statusCode, 'Importing "base" failed').toBe(200);
      result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      payloadAsArray = Object.values(result.payload!);
      // then, importable module count goes down by one
      expect(payloadAsArray.length).toBe(3);
      optionsDecision.showAll = true;
      result = await commandHandler.command(
        Cmd.show,
        ['importableModules'],
        optionsDecision,
      );
      expect(result.statusCode).toBe(200);
      payloadAsArray = Object.values(result.payload!);
      // all modules are still contain 'base'
      expect(payloadAsArray.length).toBe(4);
    }, 30000);
  });
});

describe('show', () => {
  const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
  const testDir = join(baseDir, 'tmp-show-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let showCmd: Show;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
    showCmd = commands.showCmd;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('showAttachments (success)', async () => {
    const results = await showCmd.showAttachments();
    expect(results).not.toBeUndefined();
  });
  it('showAttachment (success)', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'the-needle.heic';
    const results = await showCmd.showAttachment(cardId, attachmentName);
    expect(results).not.toBeUndefined();
  });
  it('showAttachment - empty card key', async () => {
    const cardId = '';
    const attachmentName = 'the-needle.heic';
    await expect(
      showCmd.showAttachment(cardId, attachmentName),
    ).rejects.toThrow(`Mandatory parameter 'cardKey' missing`);
  });
  it('showAttachment - card does not have particular attachment', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'i-dont-exist';
    await expect(
      showCmd.showAttachment(cardId, attachmentName),
    ).rejects.toThrow(
      `Attachment 'i-dont-exist' not found for card decision_1`,
    );
  });
  it('showCardDetails (success)', async () => {
    const cardId = 'decision_1';
    const result = await showCmd.showCardDetails(cardId);
    expect(result.key).toBe('decision_1');
  });
  it('showCardDetails - empty card key', async () => {
    const cardId = '';
    await expect(showCmd.showCardDetails(cardId)).rejects.toThrow(
      `Mandatory parameter 'cardKey' missing`,
    );
  });
  it('showCardDetails - card not in project', async () => {
    const cardId = 'decision_999';
    await expect(showCmd.showCardDetails(cardId)).rejects.toThrow(
      CardNotFoundError,
    );
  });
  it('showCardDetails - empty attachment folder', async () => {
    // Use existing cards from test data
    // decision_1 (template) has the-needle.heic, decision_2 (template) has no attachments
    // decision_5 (project) has games.jpg, decision_6 (project child) has no attachments
    const cardWithNoAttachments = 'decision_2'; // template card with no attachments
    const cardWithAttachments = 'decision_1'; // template card with attachment

    // Test card with no attachments
    const noAttachmentResult = await showCmd.showCardDetails(
      cardWithNoAttachments,
    );
    expect(noAttachmentResult.attachments.length).toBe(0);

    // Test card with attachments
    const withAttachmentResult =
      await showCmd.showCardDetails(cardWithAttachments);
    expect(withAttachmentResult.attachments.length).toBeGreaterThan(0);
    const firstAttachment = withAttachmentResult.attachments.at(0);
    expect(firstAttachment!.card).toBe(cardWithAttachments);
  });
  it('showCards (success)', async () => {
    const results = await showCmd.showCards();
    expect(results).not.toBeUndefined();
  });
  it('showProjectCards (success)', async () => {
    const results = await showCmd.showProjectCards();
    expect(results).not.toBeUndefined();
  });
  it('showResource - card type (success)', async () => {
    const cardType = 'decision/cardTypes/decision';
    const results = await showCmd.showResource(cardType);
    expect(results).not.toBeUndefined();
  });
  it('showResource - empty cardType', async () => {
    const cardType = '';

    await expect(showCmd.showResource(cardType)).rejects.toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('showResource - card type does not exist in project', async () => {
    const cardType = 'decision/cardTypes/my-card-type';

    await expect(showCmd.showResource(cardType)).rejects.toThrow(
      `CardType '${cardType}' does not exist in the project`,
    );
  });
  it('showCardTypesWithDetails (success)', async () => {
    const results = await showCmd.showCardTypesWithDetails();
    expect(results).not.toBeUndefined();
  });
  it('showResource - field type (success)', async () => {
    const fieldTypeName = 'decision/fieldTypes/obsoletedBy';
    const results = await showCmd.showResource(fieldTypeName);
    expect(results).not.toBeUndefined();
  });
  it('showResource - field type does not exist', async () => {
    const fieldTypeName = 'decision/fieldTypes/i-do-not-exist';

    await expect(showCmd.showResource(fieldTypeName)).rejects.toThrow(
      `FieldType '${fieldTypeName}' does not exist in the project`,
    );
  });
  it('showResource - link type (success)', async () => {
    const fieldTypeName = 'decision/linkTypes/test';
    const results = await showCmd.showResource(fieldTypeName);
    expect(results).not.toBeUndefined();
  });
  it('try showResource - link type does not exist', async () => {
    const linkTypeName = 'decision/linkTypes/i-do-not-exist';

    await expect(showCmd.showResource(linkTypeName)).rejects.toThrow(
      `LinkType '${linkTypeName}' does not exist in the project`,
    );
  });
  it('showModule - no module name defined', async () => {
    const moduleName = '';

    await expect(showCmd.showModule(moduleName)).rejects.toThrow(
      `Module '' does not exist in the project`,
    );
  });
  it('showModules (success)', async () => {
    const results = await showCmd.showModules();
    expect(results).not.toBeUndefined();
  });
  it('showProject (success)', async () => {
    const results = await showCmd.showProject();
    expect(results).not.toBeUndefined();
    expect(results).to.have.property('name');
    expect(results).to.have.property('path');
    expect(results).to.have.property('prefix');
    expect(results).to.have.property('modules');
    expect(results).to.have.property('hubs');
    expect(results).to.have.property('numberOfCards');
    expect(results).to.have.property('description');
    expect(results).to.have.property('category');
  });
  it('showResource - template (success)', async () => {
    const templateName = 'decision/templates/decision';
    const results = await showCmd.showResource(templateName);
    expect(results).not.toBeUndefined();
  });
  it('showResource - template with no name', async () => {
    const templateName = '';

    await expect(showCmd.showResource(templateName)).rejects.toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('showResource - template does not exist in project', async () => {
    const templateName = 'decision/templates/i-do-not-exist';
    await expect(showCmd.showResource(templateName)).rejects.toThrow(
      `Template '${templateName}' does not exist in the project`,
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
      expect(results).not.toBeUndefined();
    }
  });
  it('showResources - invalid type', async () => {
    const validResourceTypes = ['unknown'];
    for (const type of validResourceTypes) {
      const results = await showCmd.showResources(type);
      expect(results.length).toBe(0);
    }
  });
  it('showTemplatesWithDetails (success)', async () => {
    const results = await showCmd.showTemplatesWithDetails();
    expect(results).not.toBeUndefined();
  });
  it('showResource - workflow (success)', async () => {
    const workflowName = 'decision/workflows/decision';
    const results = await showCmd.showResource(workflowName);
    expect(results).not.toBeUndefined();
  });
  it('showResource - workflow expect type(success)', async () => {
    const workflowName = 'decision/workflows/decision';
    const results = await showCmd.showResource(workflowName, 'workflows');
    expect(results).not.toBeUndefined();
  });
  it('showResource - reject non-expected resource types', async () => {
    const workflowName = 'decision/workflows/decision';
    await expect(
      showCmd.showResource(workflowName, 'cardTypes'),
    ).rejects.toThrow(
      `While fetching 'decision/workflows/decision': Expected type 'cardTypes', but got 'workflows' instead`,
    );
  });
  it('showResource - empty workflow name', async () => {
    const workflowName = '';
    await expect(showCmd.showResource(workflowName)).rejects.toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('showResource - workflow does not exist in project', async () => {
    const workflowName = 'decision/workflows/i-do-not-exist';
    await expect(showCmd.showResource(workflowName)).rejects.toThrow(
      `Workflow '${workflowName}' does not exist in the project`,
    );
  });
  it('should show existing resources without category', async () => {
    const cardType = 'decision/cardTypes/decision';
    const ctResults = await showCmd.showResource(cardType);
    expect(ctResults).not.toBeUndefined();
    expect(ctResults.category).toBe(undefined);

    const fieldTypeName = 'decision/fieldTypes/obsoletedBy';
    const ftResults = await showCmd.showResource(fieldTypeName);
    expect(ftResults).not.toBeUndefined();
    expect(ftResults.category).toBe(undefined);

    const linkTypeName = 'decision/linkTypes/test';
    const ltResults = await showCmd.showResource(linkTypeName);
    expect(ltResults).not.toBeUndefined();
    expect(ltResults.category).toBe(undefined);

    // Test data for template has category... skipped!

    const workflowName = 'decision/workflows/decision';
    const wfResults = await showCmd.showResource(workflowName);
    expect(wfResults).not.toBeUndefined();
    expect(wfResults.category).toBe(undefined);

    const reportName = 'decision/reports/testReport';
    const reportResults = await showCmd.showResource(reportName);
    expect(reportResults).not.toBeUndefined();
    expect(reportResults.category).toBe(undefined);
  });
  it('showWorkflowsWithDetails (success)', async () => {
    const results = await showCmd.showWorkflowsWithDetails();
    expect(results).not.toBeUndefined();
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
    expect(results).not.toBeUndefined();
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
    ).rejects.toThrow(`Report 'decision/reports/wrongReport' does not exist`);
  });

  it('show content template (success)', async () => {
    // TODO: should be moved to resource tests
    const name = 'decision/reports/anotherReport';
    const result = await commands.project.resources
      .byType(name, 'reports')
      .show();
    expect(result).not.toBeUndefined();
    const content = result.content.contentTemplate;
    expect(content).not.toBeUndefined();
    expect(content).to.be.a('string');
    expect(content.length).toBeGreaterThan(0);
  });

  it('showCardLogicProgram (success)', async () => {
    const cardKey = 'decision_1';
    const result = await showCmd.showCardLogicProgram(cardKey);
    expect(result).not.toBeUndefined();
    expect(result).to.be.a('string');
  });

  it('showCardLogicProgram - card does not exist', async () => {
    const cardKey = 'nonexistent_card';

    await expect(showCmd.showCardLogicProgram(cardKey)).rejects.toThrow(
      `Card 'nonexistent_card' does not exist in the project`,
    );
  });

  it('showLogicProgram (success)', async () => {
    const resourceNameStr = 'decision/cardTypes/decision';
    const result = await showCmd.showLogicProgram(
      resourceName(resourceNameStr),
    );
    expect(result).not.toBeUndefined();
    expect(result).to.be.a('string');
  });

  it('showLogicProgram - resource does not exist', async () => {
    const resourceNameStr = 'decision/cardTypes/nonexistent';

    await expect(
      showCmd.showLogicProgram(resourceName(resourceNameStr)),
    ).rejects.toThrow(
      `Resource 'decision/cardTypes/nonexistent' does not exist in the project`,
    );
  });

  it('showAllTemplateCards shall provide a hierarchical array', async () => {
    const results = await showCmd.showAllTemplateCards();
    expect(results).not.toBeUndefined();
    expect(results.length).toBeGreaterThan(0);

    const templateWithCards = results.find((t) => t.cards.length > 0);
    if (templateWithCards && templateWithCards.cards.length > 0) {
      const verifyCardStructure = (
        card: { key: string; childrenCards?: unknown[] },
        depth: number = 0,
      ) => {
        expect(card).to.have.property('key');
        expect(card).to.have.property('childrenCards');
        expect(Array.isArray(card.childrenCards)).toBe(true);

        if (card.childrenCards && card.childrenCards.length > 0) {
          card.childrenCards.forEach((child) => {
            verifyCardStructure(
              child as { key: string; childrenCards?: unknown[] },
              depth + 1,
            );
          });
        }
      };

      templateWithCards.cards.forEach((card) => {
        verifyCardStructure(card);
      });
    }
  });
});
