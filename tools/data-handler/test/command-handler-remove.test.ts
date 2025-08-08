// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { type CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { Remove } from '../src/commands/index.js';

import type { Card } from '../src/interfaces/project-interfaces.js';
import type { requestStatus } from '../src/interfaces/request-status-interfaces.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-remove-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const options: CardsOptions = { projectPath: decisionRecordsPath };
const optionsMini: CardsOptions = { projectPath: minimalPath };

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
      expect(result.statusCode).to.equal(200);
    });
    it('remove label (success)', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_5', 'test'],
        options,
      );
      expect(result.statusCode).to.equal(200);
      // should have 1 label now, so we can delete with
      const result2 = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_5'],
        options,
      );
      expect(result2.statusCode).to.equal(200);
    });

    it('try remove label - does not exist', async () => {
      const result2 = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_6'],
        options,
      );
      expect(result2.statusCode).to.equal(400);
    });

    it('try remove label - card does not exist', async () => {
      const result2 = await commandHandler.command(
        Cmd.remove,
        ['label', 'decision_8', 'test'],
        options,
      );
      expect(result2.statusCode).to.equal(400);
    });
    /*
    it('remove link (success)', async () => {
      const linkName = 'testLinkName';
      const linkFullName = 'decision/linkTypes/' + linkName;
      const success = await createLinkType(commandHandler, linkName);
      expect(success.statusCode).equals(200);
      const card = await createCard(commandHandler);
      const cardId = card.affectsCards![0];
      await commandHandler.command(
        Cmd.create,
        ['link', 'decision_5', cardId, resourceName],
        options,
      );

      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'decision_5', cardId, resourceName],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    */

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
      expect(result.statusCode).to.equal(200);
      result = await commandHandler.command(
        Cmd.show,
        ['card', cardId2],
        options,
      );
      expect(result.statusCode).to.equal(200);

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
      expect(result.statusCode).to.equal(200);

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
      expect(found?.length).to.equal(0);
    });

    it('remove linkType', async () => {
      const name = 'test';
      await createLinkType(commandHandler, name);
      const fullName = 'decision/linkTypes/' + name;
      const result = await commandHandler.command(
        Cmd.remove,
        ['linkType', fullName],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('remove attachment (success)', async () => {
      const attachment = 'the-needle.heic';
      const attachmentPath = join(testDir, 'attachments' + sep + attachment);
      const card = await createCard(commandHandler);

      // To avoid logged errors from clingo queries during tests, generate calculations.
      const project = new Project(decisionRecordsPath);
      await project.calculationEngine.generate();

      const cardId = card.affectsCards![0];
      await commandHandler.command(
        Cmd.create,
        ['attachment', attachmentPath],
        options,
      );
      const attachmentNameWithCardId = `${cardId}-${attachment}`;

      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardId, attachmentNameWithCardId],
        options,
      );
      expect(result.statusCode).to.equal(200);
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
      expect(result.statusCode).to.equal(200);
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
      expect(result.statusCode).to.equal(200);
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
      expect(result.statusCode).to.equal(200);
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
      expect(result.statusCode).to.equal(200);
    });
    it('remove template (success)', async () => {
      const templateName = 'decision/templates/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        options,
      );
      expect(result.statusCode).to.equal(200);
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
      expect(result.statusCode).to.equal(200);
    });
    it('try to remove workflow that this is still used', async () => {
      const workflowName = `decision/workflows/decision`;
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflowName],
        options,
      );
      expect(result.statusCode).to.equal(400);
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
    it('remove card - project missing', async () => {
      const cardId = 'decision_5';
      const invalidProject = { projectPath: 'idontexist' };
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardId],
        invalidProject,
      );
      expect(result.statusCode).to.equal(400);
    });

    it('remove card - card not found', async () => {
      const cardId = 'decision_999';
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardId],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove linkType - linkType missing', async () => {
      const linkType = 'mini/linkTypes/lt_name';
      const result = await commandHandler.command(
        Cmd.remove,
        ['linkType', linkType],
        optionsMini,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try remove link - link not found', async () => {
      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'decision_5', 'decision_6', 'does-not-exist'],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove attachment - project missing', async () => {
      const cardId = 'decision_5';
      const attachment = 'the-needle.heic';
      const invalidProject = { projectPath: 'idontexist' };
      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardId, attachment],
        invalidProject,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove attachment - attachment not found', async () => {
      const cardId = 'decision_5';
      const attachment = 'i-dont-exist.jpg';
      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardId, attachment],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove cardType - card type missing', async () => {
      const cardTypeName = 'decision/cardTypes/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['cardType', cardTypeName],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove fieldType - field type missing', async () => {
      const fieldTypeName = 'decision/fieldTypes/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['fieldType', fieldTypeName],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove report - report missing', async () => {
      const reportName = 'decision/reports/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['report', reportName],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove template - template missing', async () => {
      const templateName = 'decision/templates/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove template - project missing', async () => {
      const templateName = 'decision/templates/simplepage';
      const invalidProject = { projectPath: 'i-do-not-exist' };
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        invalidProject,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove workflow - workflow missing', async () => {
      const workflowName = 'decision/workflows/i-do-not-exist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflowName],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('try to remove unknown type', async () => {
      const cardId = 'decision_5';
      const result = await commandHandler.command(
        Cmd.remove,
        ['i-dont-exist', cardId],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove() - try to remove non-existing attachment', async () => {
      const cardId = 'decision_5';
      const project = new Project(decisionRecordsPath);
      const removeCmd = new Remove(project);
      await removeCmd
        .remove('attachment', cardId, '')
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    });
    it('remove() - try to remove attachment from non-existing card', async () => {
      const cardId = 'decision_999';
      const project = new Project(decisionRecordsPath);
      const removeCmd = new Remove(project);
      await removeCmd
        .remove('attachment', cardId, 'the-needle.heic')
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    });
    it('remove() - try to remove non-existing module', async () => {
      const project = new Project(decisionRecordsPath);
      const removeCmd = new Remove(project);
      await removeCmd
        .remove('module', 'i-dont-exist')
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    });
  });
});
