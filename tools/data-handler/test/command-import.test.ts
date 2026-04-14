import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';
import { Fetch, Show } from '../src/commands/index.js';
import { ModuleManager } from '../src/module-manager.js';
import {
  getTestProject,
  mockEnsureModuleListUpToDate,
} from './helpers/test-utils.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-import-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const optionsMini = { projectPath: minimalPath };
const options = { projectPath: decisionRecordsPath };

describe('import csv command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('import csv file (success)', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv')],
      options,
    );
    expect(result.statusCode).toBe(200);

    const [key1, key2] = result.payload as string[];

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const fetchCmd = new Fetch(project);
    const show = new Show(project, fetchCmd);
    const card1 = await show.showCardDetails(key1);
    const card2 = await show.showCardDetails(key2);
    expect(card1.metadata!.title).toBe('Title1');
    expect(card1.content).toBe('content1');
    expect(card1.metadata!.labels).toEqual([
      'template-test-label',
      'label-first',
      'label-second',
    ]);
    expect(card1.metadata!['decision/fieldTypes/responsible']).toBe(
      'responsible@email.com',
    );
    expect(card1.metadata!.doesnotexist).toBeUndefined();
    expect(card2.metadata!.title).toBe('Title2');
    expect(card2.content).toBe('content2');
    // no labels specified, takes them from the template
    expect(card2.metadata!.labels).toEqual(['template-test-label']);
    expect(card2.metadata!['decision/fieldTypes/responsible']).toBe('');
    expect(card2.metadata!.doesnotexist).toBeUndefined();
  });
  it('import csv file with parent (success)', async () => {
    const parent = 'decision_6';
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv'), parent],
      options,
    );
    expect(result.statusCode).toBe(200);

    const createdKeys = result.payload as string[];
    // Use command handler to get card details for consistent project instance
    const parentCardResult = await commandHandler.command(
      Cmd.show,
      ['card', parent],
      { ...options, details: true },
    );
    expect(parentCardResult.statusCode).toBe(200);
    type ParentCard = { children?: string[] };
    const parentCard = parentCardResult.payload as ParentCard;

    expect(createdKeys).toHaveLength(2);
    expect(parentCard.children).toContain(createdKeys[0]);
    expect(parentCard.children).toContain(createdKeys[1]);
  });
  it('try to import csv file without all required columns', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'invalid-missing-columns-real.csv')],
      options,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('requires property "template"');
  });
  it('try to import csv file with invalid path', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', 'i-dont-exist.csv'],
      options,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('ENOENT');
  });
});

describe('import module', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('import module command', () => {
    it('import module and use it (success)', async () => {
      let result = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result.statusCode).toBe(200);

      // Verify that module content can be used to create data.
      result = await commandHandler.command(
        Cmd.create,
        ['cardType', 'newCardType', 'decision/workflows/decision'],
        optionsMini,
      );
      expect(result.statusCode).toBe(200);

      // Ensure that module can be updated.
      result = await commandHandler.command(Cmd.updateModules, [], optionsMini);
      expect(result.statusCode).toBe(200);

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
      const testOptions = { projectPath: projectDir };
      const data = await commandHandler.command(
        Cmd.create,
        ['project', name, prefix],
        testOptions,
      );
      expect(data.statusCode).toBe(200);
      let result = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        testOptions,
      );
      expect(result.statusCode).toBe(200);
      result = await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        testOptions,
      );
      expect(result.statusCode).toBe(200);
      result = await commandHandler.command(Cmd.updateModules, [], testOptions);
      expect(result.statusCode).toBe(200);
      result = await commandHandler.command(Cmd.show, ['modules'], testOptions);
      expect(result.statusCode).toBe(200);
      if (result.payload) {
        const modules = result.payload as Array<{ name: string }>;
        expect(modules.length).toBe(2);
        expect(modules.map((m) => m.name)).toContain('mini');
        expect(modules.map((m) => m.name)).toContain('decision');
      }
    }, 10000);
    it('try to import module - no source', async () => {
      const stubProjectPath = vi
        .spyOn(commandHandler, 'setProjectPath')
        .mockResolvedValue('path');
      const result = await commandHandler.command(
        Cmd.import,
        ['module', ''],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
      stubProjectPath.mockRestore();
    });
    it('try to import module - no destination', async () => {
      const stubProjectPath = vi
        .spyOn(commandHandler, 'setProjectPath')
        .mockResolvedValue('path');
      const invalidOptions = { projectPath: '' };
      await expect(
        commandHandler.command(
          Cmd.import,
          ['module', decisionRecordsPath],
          invalidOptions,
        ),
      ).resolves.toEqual({
        statusCode: 400,
        message: "Input validation error: cannot find project ''",
      });
      stubProjectPath.mockRestore();
    });
    it('try to import module - twice the same module', async () => {
      const result1 = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result1.statusCode).toBe(200);
      const result2 = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result2.statusCode).toBe(400);
    });
    it('try to import module - that has the same prefix', async () => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
  });

  describe('modifying imported module content is forbidden', () => {
    beforeAll(async () => {
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
        ['card', templateName, cardType, cardKey],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to add child card to a module card', async () => {
      const templateName = 'decision/templates/decision';
      const cardType = 'decision/cardTypes/decision';
      const cardKey = 'decision_2';
      // try to add new card to decision_2 when 'decision-records' has been imported to 'minimal'
      const result = await commandHandler.command(
        Cmd.add,
        ['card', templateName, cardType, cardKey],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to create attachment to a module card', async () => {
      const attachmentPath = join(testDir, 'attachments/the-needle.heic');
      const cardKey = 'decision_2';
      const result = await commandHandler.command(
        Cmd.create,
        ['attachment', cardKey, attachmentPath],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });

    it('try to move a module card to another template', async () => {
      const moduleCardKey = 'decision_2';
      const templateCardKey = 'decision_1';
      const result = await commandHandler.command(
        Cmd.move,
        [templateCardKey, moduleCardKey, 'root'],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove card from a module template', async () => {
      const cardKey = 'decision_2';
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardKey],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove cardType from a module', async () => {
      const cardType = 'decision/cardTypes/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['cardType', cardType],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove fieldType from a module', async () => {
      const fieldType = 'decision/fieldTypes/finished';
      const result = await commandHandler.command(
        Cmd.remove,
        ['fieldType', fieldType],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove report from a module', async () => {
      const report = 'decision/reports/testReport';
      const result = await commandHandler.command(
        Cmd.remove,
        ['report', report],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove template from a module', async () => {
      const template = 'decision/templates/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', template],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove workflow from a module', async () => {
      const workflow = 'decision/workflows/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflow],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove attachment from a module card', async () => {
      const cardKey = 'decision_1';
      const attachment = 'the-needle.heic';
      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardKey, attachment],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
  });
});

describe('update-modules version arg', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('version without module name returns error', async () => {
    const result = await commandHandler.command(
      Cmd.updateModules,
      ['', '1.0.0'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain(
      'A target version can only be specified together with a module name',
    );
  });

  it('version with unknown module name returns error', async () => {
    mockEnsureModuleListUpToDate();
    const result = await commandHandler.command(
      Cmd.updateModules,
      ['nonexistent-module', '1.0.0'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain(
      "Module 'nonexistent-module' is not part of the project",
    );
  });

  it('version not in available list returns error', async () => {
    // Import a local module so it appears in project.configuration.modules
    await commandHandler.command(
      Cmd.import,
      ['module', decisionRecordsPath],
      optionsMini,
    );

    mockEnsureModuleListUpToDate();
    vi.spyOn(
      ModuleManager.prototype,
      'listAvailableVersions',
    ).mockResolvedValue(['2.0.0', '3.0.0']);

    const result = await commandHandler.command(
      Cmd.updateModules,
      ['decision', '1.0.0'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain("Version '1.0.0' is not available");
    expect(result.message).toContain('2.0.0');
    expect(result.message).toContain('3.0.0');
  });
});
