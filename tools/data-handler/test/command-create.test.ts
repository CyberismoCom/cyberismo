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

import type { CreateCommandOptions } from '../src/interfaces/command-options.js';
import { Checkout } from '../src/containers/project.js';
import { Validate } from '../src/commands/index.js';
import { findCard } from '../src/cards/read.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import { SYSTEM_ACTOR } from '../src/utils/tx-record.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-create-tests');

const commandHandler: Commands = new Commands();

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

  it('access default parameters for template (success)', () => {
    const defaultContent = DefaultContent.template('testName');
    expect(defaultContent.displayName).toBe('');
    expect(defaultContent.category).toBe(undefined);
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
