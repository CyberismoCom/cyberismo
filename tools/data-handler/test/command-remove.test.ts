import { expect, it, describe, beforeEach, afterEach } from 'vitest';

// node
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, sep, resolve as pathResolve } from 'node:path';

// cyberismo
import { Cmd, Commands, CommandManager } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Fetch, Remove } from '../src/commands/index.js';
import { getTestBaseDir, getTestProject } from './helpers/test-utils.js';
import { makeFakeModuleFixture } from './helpers/module-fixtures.js';

import type { Card } from '../src/interfaces/project-interfaces.js';
import type { requestStatus } from '../src/interfaces/request-status-interfaces.js';
import { CardNotFoundError } from '../src/exceptions/index.js';

// Create test artifacts in a temp folder.
const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
const testDir = join(baseDir, 'tmp-command-handler-remove-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const options = { projectPath: decisionRecordsPath };
const optionsMini = { projectPath: minimalPath };

async function createLinkType(
  commandHandler: Commands,
  name: string,
): Promise<requestStatus> {
  const status = await commandHandler.command(
    Cmd.create,
    ['linkType', name],
    options,
  );
  return status;
}

async function createCard(commandHandler: Commands): Promise<requestStatus> {
  const templateName = 'decision/templates/decision';
  const status = await commandHandler.command(
    Cmd.create,
    ['card', templateName],
    options,
  );
  return status;
}

describe('remove command', () => {
  const commandHandler: Commands = new Commands();
  describe('successful removals - test data is cleaned afterwards', () => {
    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data', testDir);
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('remove card', async () => {
      const card = await createCard(commandHandler);
      const cardId = card.affectsCards![0];
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardId],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove label (success)', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_5', 'test'],
        options,
      );
      expect(result.statusCode).toBe(200);
      // should have 1 label now, so we can delete with
      const result2 = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_5'],
        options,
      );
      expect(result2.statusCode).toBe(200);
    });

    // Create two cards, link them together. Remove the other card.
    // Check that link has disappeared from the first card as well.
    it('removing card removes links (success)', async () => {
      const linkName = 'test';
      const resourceName = 'decision/linkTypes/' + linkName;
      const card = await createCard(commandHandler);
      const card2 = await createCard(commandHandler);
      const cardId = card.affectsCards![0];
      const cardId2 = card2.affectsCards![0];
      let result = await commandHandler.command(
        Cmd.create,
        ['link', cardId2, cardId, resourceName],
        options,
      );
      expect(result.statusCode).toBe(200);
      result = await commandHandler.command(
        Cmd.show,
        ['card', cardId2],
        options,
      );
      expect(result.statusCode).toBe(200);

      // Link should exist between cardId and cardId2
      let shownCard = result.payload as Card;
      let found = shownCard.metadata?.links.filter(
        (item) => item.cardKey === cardId,
      );
      expect(found?.length).to.equal(1);

      // Remove the first card
      result = await commandHandler.command(
        Cmd.remove,
        ['card', cardId],
        options,
      );
      expect(result.statusCode).toBe(200);

      // cardId2 should no longer have link to the other card
      result = await commandHandler.command(
        Cmd.show,
        ['card', cardId2],
        options,
      );
      shownCard = result.payload as Card;
      found = shownCard.metadata?.links.filter(
        (item) => item.cardKey === cardId,
      );
      expect(found?.length).toBe(0);
    });

    // Create two links of the same type between the same cards, one with and one without
    // a description. Removing the link without description must not remove the one with
    // a description.
    it('removing link without description does not remove same-type link with description', async () => {
      const resourceName = 'decision/linkTypes/test';
      const card = await createCard(commandHandler);
      const card2 = await createCard(commandHandler);
      const cardId = card.affectsCards![0];
      const cardId2 = card2.affectsCards![0];

      // Create link without description
      let result = await commandHandler.command(
        Cmd.create,
        ['link', cardId, cardId2, resourceName],
        options,
      );
      expect(result.statusCode).toBe(200);

      // Create link with description
      result = await commandHandler.command(
        Cmd.create,
        ['link', cardId, cardId2, resourceName, 'my description'],
        options,
      );
      expect(result.statusCode).toBe(200);

      // Remove only the link without description
      result = await commandHandler.command(
        Cmd.remove,
        ['link', cardId, cardId2, resourceName],
        options,
      );
      expect(result.statusCode).toBe(200);

      // The link with description should still exist
      result = await commandHandler.command(
        Cmd.show,
        ['card', cardId],
        options,
      );
      const shownCard = result.payload as Card;
      const remaining = shownCard.metadata?.links.filter(
        (l) => l.cardKey === cardId2 && l.linkType === resourceName,
      );
      expect(remaining).toHaveLength(1);
      expect(remaining![0].linkDescription).toBe('my description');
    });

    // Create two links of the same type with different descriptions.
    // Removing one by description must leave the other intact.
    it('removing link by description does not remove same-type link with different description', async () => {
      const resourceName = 'decision/linkTypes/test';
      const card = await createCard(commandHandler);
      const card2 = await createCard(commandHandler);
      const cardId = card.affectsCards![0];
      const cardId2 = card2.affectsCards![0];

      // Create two links with different descriptions
      let result = await commandHandler.command(
        Cmd.create,
        ['link', cardId, cardId2, resourceName, 'desc A'],
        options,
      );
      expect(result.statusCode).toBe(200);

      result = await commandHandler.command(
        Cmd.create,
        ['link', cardId, cardId2, resourceName, 'desc B'],
        options,
      );
      expect(result.statusCode).toBe(200);

      // Remove only the link with 'desc A'
      result = await commandHandler.command(
        Cmd.remove,
        ['link', cardId, cardId2, resourceName, 'desc A'],
        options,
      );
      expect(result.statusCode).toBe(200);

      // Only link with 'desc B' should remain
      result = await commandHandler.command(
        Cmd.show,
        ['card', cardId],
        options,
      );
      const shownCard = result.payload as Card;
      const remaining = shownCard.metadata?.links.filter(
        (l) => l.cardKey === cardId2 && l.linkType === resourceName,
      );
      expect(remaining).toHaveLength(1);
      expect(remaining![0].linkDescription).toBe('desc B');
    });

    // External link removal tests
    it('remove external link outbound (success)', async () => {
      // First create an external link
      await commandHandler.command(
        Cmd.create,
        ['link', 'decision_5', 'jira:EXT-123', 'decision/linkTypes/test'],
        options,
      );
      // Then remove it
      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'decision_5', 'jira:EXT-123', 'decision/linkTypes/test'],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });

    it('remove external link inbound (success)', async () => {
      // First create an inbound external link (external first = inbound)
      await commandHandler.command(
        Cmd.create,
        ['link', 'jira:EXT-456', 'decision_5', 'decision/linkTypes/test'],
        options,
      );
      // Then remove it
      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'jira:EXT-456', 'decision_5', 'decision/linkTypes/test'],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });

    it('remove linkType', async () => {
      const name = 'testLinkTypeForRemoval';
      await createLinkType(commandHandler, name);
      const fullName = 'decision/linkTypes/' + name;
      const result = await commandHandler.command(
        Cmd.remove,
        ['linkType', fullName],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove attachment (success)', async () => {
      const attachment = 'the-needle.heic';
      const attachmentPath = join(testDir, 'attachments' + sep + attachment);
      const card = await createCard(commandHandler);

      // To avoid logged errors from clingo queries during tests, generate calculations.
      const project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      await project.calculationEngine.generate();

      const cardId = card.affectsCards![0];
      await commandHandler.command(
        Cmd.create,
        ['attachment', cardId, attachmentPath],
        options,
      );
      const attachmentNameWithCardId = `${cardId}-${attachment}`;

      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardId, attachmentNameWithCardId],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove cardType (success)', async () => {
      // First create a cardType, then remove it
      const name = 'testForCreation';
      const workflow = 'decision/workflows/decision';
      await commandHandler.command(
        Cmd.create,
        ['cardType', name, workflow],
        options,
      );
      const cardTypeName = `decision/cardTypes/${name}`;
      const result = await commandHandler.command(
        Cmd.remove,
        ['cardType', cardTypeName],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove cardType with name only', async () => {
      // First create a cardType, then remove it
      const name = 'testForCreationWithOutName';
      const cardTypeName = `decision/cardTypes/${name}`;
      const workflow = 'decision/workflows/decision';
      await commandHandler.command(
        Cmd.create,
        [cardTypeName, workflow],
        options,
      );
      const result = await commandHandler.command(
        Cmd.remove,
        [cardTypeName],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove fieldType (success)', async () => {
      // First create a fieldType, then remove it
      const name = 'testForCreation';
      const dataType = 'integer';
      await commandHandler.command(
        Cmd.create,
        ['fieldType', name, dataType],
        options,
      );
      const fieldTypeName = `decision/fieldTypes/${name}`;
      const result = await commandHandler.command(
        Cmd.remove,
        ['fieldType', fieldTypeName],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove report (success)', async () => {
      // First create a report, then remove it
      const name = 'testForCreation';
      await commandHandler.command(Cmd.create, ['report', name], options);
      const report = `decision/reports/${name}`;
      const result = await commandHandler.command(
        Cmd.remove,
        ['report', report],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove template (success)', async () => {
      const templateName = 'decision/templates/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove workflow (success)', async () => {
      // First create a workflow, then remove it
      const name = 'testForCreation';
      await commandHandler.command(Cmd.create, ['workflow', name], options);
      const workflowName = `decision/workflows/${name}`;
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflowName],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
    it('remove hub', async () => {
      const hub =
        'https://raw.githubusercontent.com/CyberismoCom/cyberismo/main/tools/assets/src/hub/';

      // add hub first, since test data does not have hubs
      await commandHandler.command(Cmd.add, ['hub', hub], options);
      // then remove it
      const result = await commandHandler.command(
        Cmd.remove,
        ['hub', hub],
        options,
      );
      expect(result.statusCode).toBe(200);
    });
  });

  describe('removal attempts', () => {
    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data', testDir);
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('try to remove card - project missing', async () => {
      const cardId = 'decision_5';
      const invalidProject = { projectPath: 'idontexist' };
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardId],
        invalidProject,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove card - card not found', async () => {
      const cardId = 'decision_999';
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardId],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove label - does not exist', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_6'],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove label - card does not exist', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_8', 'test'],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove linkType - linkType missing', async () => {
      const linkType = 'mini/linkTypes/lt_name';
      const result = await commandHandler.command(
        Cmd.remove,
        ['linkType', linkType],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove link - link not found', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'decision_5', 'decision_6', 'does-not-exist'],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove external link - not found', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'decision_5', 'jira:NOTFOUND-999', 'decision/linkTypes/test'],
        options,
      );
      expect(result.statusCode).to.equal(400);
      expect(result.message).to.contain('not found');
    });
    it('try to remove external link - both external', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'jira:ABC-1', 'jira:DEF-2', 'decision/linkTypes/test'],
        options,
      );
      expect(result.statusCode).to.equal(400);
      expect(result.message).to.contain('One must be a card');
    });
    it('try to remove attachment - project missing', async () => {
      const cardId = 'decision_5';
      const attachment = 'the-needle.heic';
      const invalidProject = { projectPath: 'idontexist' };
      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardId, attachment],
        invalidProject,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove attachment - attachment not found', async () => {
      const cardId = 'decision_5';
      const attachment = 'i-dont-exist.jpg';
      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardId, attachment],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove cardType - card type missing', async () => {
      const cardTypeName = 'decision/cardTypes/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['cardType', cardTypeName],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove fieldType - field type missing', async () => {
      const fieldTypeName = 'decision/fieldTypes/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['fieldType', fieldTypeName],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove report - report missing', async () => {
      const reportName = 'decision/reports/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['report', reportName],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove template - template missing', async () => {
      const templateName = 'decision/templates/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove template - project missing', async () => {
      const templateName = 'decision/templates/simplepage';
      const invalidProject = { projectPath: 'i-do-not-exist' };
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        invalidProject,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove workflow - workflow missing', async () => {
      const workflowName = 'decision/workflows/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflowName],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove unknown type', async () => {
      const cardId = 'decision_5';
      const result = await commandHandler.command(
        Cmd.remove,
        ['i-dont-exist', cardId],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove non-existing attachment', async () => {
      const cardId = 'decision_5';
      const project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      const fetchCmd = new Fetch(project);
      const removeCmd = new Remove(project, fetchCmd);

      await expect(
        removeCmd.remove('attachment', cardId, ''),
      ).rejects.toThrow();
    });
    it('try to remove attachment from non-existing card', async () => {
      const cardId = 'decision_999';
      const project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      const fetchCmd = new Fetch(project);
      const removeCmd = new Remove(project, fetchCmd);

      await expect(
        removeCmd.remove('attachment', cardId, 'the-needle.heic'),
      ).rejects.toThrow();
    });
    it('try to remove non-existing module', async () => {
      const project = getTestProject(decisionRecordsPath);
      await project.populateCaches();
      const fetchCmd = new Fetch(project);
      const removeCmd = new Remove(project, fetchCmd);

      await expect(
        removeCmd.remove('module', 'i-dont-exist'),
      ).rejects.toThrow();
    });
    it('try to remove workflow that this is still used', async () => {
      const workflowName = `decision/workflows/decision`;
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflowName],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove hub - not existing in the project', async () => {
      const hub = `https://example.com/nonExisting`;
      const result = await commandHandler.command(
        Cmd.remove,
        ['hub', hub],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
  });
});

describe('remove card', () => {
  const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
  const testDir = join(baseDir, 'tmp-remove-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should remove links to children when parent card is removed', async () => {
    // Create a parent+child pair from the simplepage template
    const simplePageTemplate = 'decision/templates/simplepage';
    const createdCards =
      await commands.createCmd.createCard(simplePageTemplate);
    const parentCard = createdCards.find(
      (card) => card.parent === 'root' && card.children.length > 0,
    );
    expect(parentCard).not.toBeUndefined();
    const childKey = parentCard!.children[0];

    // Create another card and link it to the child
    const decisionTemplate = 'decision/templates/decision';
    const otherCards = await commands.createCmd.createCard(decisionTemplate);
    const otherCardKey = otherCards[0].key;

    const linkType = 'decision/linkTypes/test';
    await commands.createCmd.createLink(otherCardKey, childKey, linkType);

    // Verify the link exists
    let otherCard = commands.project.findCard(otherCardKey);
    const linksBefore = otherCard.metadata?.links?.filter(
      (l) => l.cardKey === childKey,
    );
    expect(linksBefore).toHaveLength(1);

    // Remove the parent card (which also removes its children)
    await commands.removeCmd.remove('card', parentCard!.key);

    // The link from otherCard to the child should also be removed
    otherCard = commands.project.findCard(otherCardKey);
    const linksAfter = otherCard.metadata?.links?.filter(
      (l) => l.cardKey === childKey,
    );
    expect(linksAfter).toHaveLength(0);
  });

  it('should remove card that has children', async () => {
    const cardId = 'decision_5';
    const fetchCmd = new Fetch(commands.project);
    const removeCmd = new Remove(commands.project, fetchCmd);
    await removeCmd.remove('card', cardId);

    expect(() => commands.project.findCard(cardId)).toThrow(CardNotFoundError);
    // Since decision_6 is decision_5's child, it should have been removed as well.
    expect(() => commands.project.findCard('decision_6')).toThrow(
      CardNotFoundError,
    );
  });

  it('should not delete template cards when removing project cards', async () => {
    // Use simple-page template which has a parent card (decision_3) with a child card (decision_4)
    const templateName = 'decision/templates/simplepage';
    await commands.project.populateCaches();
    const templateResource = commands.project.resources.byType(
      templateName,
      'templates',
    );

    const template = templateResource.templateObject();

    // Get template cards
    const templateCardsBefore = template.cards();
    expect(templateCardsBefore.length).toBeGreaterThan(0);

    // Verify at least one template card has children
    const templateCardsWithChildren = templateCardsBefore.filter(
      (c) => c.children && c.children.length > 0,
    );
    expect(templateCardsWithChildren.length).toBeGreaterThan(0);

    // Create cards from template
    const createdCards = await commands.createCmd.createCard(templateName);
    expect(createdCards.length).toBeGreaterThan(0);

    const parentCardKey = createdCards.find(
      (card) => card.parent === 'root' && card.children.length > 0,
    )!.key;
    const parentCard = commands.project.findCard(parentCardKey);
    expect(parentCard.children.length).toBeGreaterThan(0);

    // Delete the created project cards
    await commands.removeCmd.remove('card', parentCardKey!);

    // Verify project card and its children are deleted
    expect(() => commands.project.findCard(parentCardKey)).toThrow(
      CardNotFoundError,
    );

    for (const childKey of parentCard.children) {
      expect(() => commands.project.findCard(childKey)).toThrow(
        CardNotFoundError,
      );
    }

    // Verify template cards still exist and were not deleted
    const templateCardsAfter = template.cards();
    expect(templateCardsAfter.length).toBe(templateCardsBefore.length);

    // Verify each template card still exists
    for (const templateCard of templateCardsBefore) {
      const foundCard = templateCardsAfter.find(
        (c) => c.key === templateCard.key,
      );
      expect(foundCard).not.toBeUndefined();
    }
  });
});

describe('remove module — spec behaviours', () => {
  const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
  const testDir = join(baseDir, 'tmp-remove-module-tests');

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('removing a transitive-only module errors with "not part of the project"', async () => {
    // A transitive-only installation has no top-level declaration, so
    // the command must reject with a clear error rather than silently
    // tearing out a dep owned by another module.
    const depRoot = join(testDir, 'fake-trans-dep');
    makeFakeModuleFixture(depRoot, { cardKeyPrefix: 'trdep' });
    const hostRoot = join(testDir, 'fake-trans-host');
    makeFakeModuleFixture(hostRoot, {
      cardKeyPrefix: 'trhost',
      modules: [{ name: 'trdep', location: `file:${pathResolve(depRoot)}` }],
    });

    const projectDir = join(testDir, 'proj-trans-only');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'trans-only-proj', 'trsp'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    await commands.importCmd.importModule(hostRoot);
    // Both are installed; only `trhost` is a top-level declaration.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trhost'))).toBe(
      true,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trdep'))).toBe(
      true,
    );
    const topLevelNames = commands.project.configuration.modules.map(
      (m) => m.name,
    );
    expect(topLevelNames).toEqual(['trhost']);

    await expect(commands.removeCmd.remove('module', 'trdep')).rejects.toThrow(
      "Module 'trdep' is not part of the project",
    );

    // Both installations still exist — the failed remove didn't
    // accidentally mutate the tree.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trhost'))).toBe(
      true,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'trdep'))).toBe(
      true,
    );
  });

  it('removing a deep transitive chain cascades the orphan cleanup to a fixed point', async () => {
    // A → B → C. Removing A must ultimately remove B and C too, via the
    // fixed-point cascade in `cleanOrphans` (iterates until stable).
    const cRoot = join(testDir, 'fake-chain-C');
    makeFakeModuleFixture(cRoot, { cardKeyPrefix: 'chc' });
    const bRoot = join(testDir, 'fake-chain-B');
    makeFakeModuleFixture(bRoot, {
      cardKeyPrefix: 'chb',
      modules: [{ name: 'chc', location: `file:${pathResolve(cRoot)}` }],
    });
    const aRoot = join(testDir, 'fake-chain-A');
    makeFakeModuleFixture(aRoot, {
      cardKeyPrefix: 'cha',
      modules: [{ name: 'chb', location: `file:${pathResolve(bRoot)}` }],
    });

    const projectDir = join(testDir, 'proj-chain');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'chain-proj', 'chpr'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    await commands.importCmd.importModule(aRoot);

    // A, B, C all installed.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'cha'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chb'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chc'))).toBe(true);

    await commands.removeCmd.remove('module', 'cha');

    // Fixed-point cascade removes all three.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'cha'))).toBe(
      false,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chb'))).toBe(
      false,
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'chc'))).toBe(
      false,
    );
    // Top-level declaration gone too.
    const topLevelNames = commands.project.configuration.modules.map(
      (m) => m.name,
    );
    expect(topLevelNames).not.toContain('cha');
  });

  it('removing a module with transitives drops the orphaned prefixes from allModulePrefixes', async () => {
    // After the orphan-cleanup cascade has deleted `.cards/modules/<name>/`
    // for each orphaned transitive, the project's cached
    // `allModulePrefixes()` must no longer list them — `cleanOrphans`
    // refreshes that cache itself.
    const cRoot = join(testDir, 'fake-drop-C');
    makeFakeModuleFixture(cRoot, { cardKeyPrefix: 'drpc' });
    const bRoot = join(testDir, 'fake-drop-B');
    makeFakeModuleFixture(bRoot, {
      cardKeyPrefix: 'drpb',
      modules: [{ name: 'drpc', location: `file:${pathResolve(cRoot)}` }],
    });
    const aRoot = join(testDir, 'fake-drop-A');
    makeFakeModuleFixture(aRoot, {
      cardKeyPrefix: 'drpa',
      modules: [{ name: 'drpb', location: `file:${pathResolve(bRoot)}` }],
    });

    const projectDir = join(testDir, 'proj-drop-prefix');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'drop-prefix-proj', 'dppr'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    await commands.importCmd.importModule(aRoot);
    // All three transitives live in the cached prefix list.
    expect(commands.project.allModulePrefixes()).toContain('drpa');
    expect(commands.project.allModulePrefixes()).toContain('drpb');
    expect(commands.project.allModulePrefixes()).toContain('drpc');

    await commands.removeCmd.remove('module', 'drpa');

    // Orphan cascade removed the transitives from disk *and* from the
    // cached prefix list.
    expect(commands.project.allModulePrefixes()).not.toContain('drpa');
    expect(commands.project.allModulePrefixes()).not.toContain('drpb');
    expect(commands.project.allModulePrefixes()).not.toContain('drpc');
  });
});
