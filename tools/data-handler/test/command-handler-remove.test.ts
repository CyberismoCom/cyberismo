// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// cyberismo
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { Calculate } from '../src/calculate.js';
import { Remove } from '../src/remove.js';
import { copyDir } from '../src/utils/file-utils.js';
import { requestStatus } from '../src/interfaces/request-status-interfaces.js';

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-remove-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const options: CardsOptions = { projectPath: decisionRecordsPath };
const optionsMini: CardsOptions = { projectPath: minimalPath };

async function createLinkType(name: string): Promise<void> {
  await commandHandler.command(Cmd.create, ['linkType', name], options);
}

async function createCard(): Promise<requestStatus> {
  const templateName = 'decision/templates/decision';
  const status = await commandHandler.command(
    Cmd.create,
    ['card', templateName],
    options,
  );
  return status;
}

describe('remove command', () => {
  describe('successful removals - test data is cleaned afterwards', () => {
    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data', testDir);
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    // @todo: Test case commented out for now;
    // the event emitter from create is creating the files after the content should have been destroyed.
    /*
    it('remove card', async () => {
      const card = await createCard();
      const cardId = card.affectsCards![0];
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardId],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    */
    it('remove linkType', async () => {
      const name = 'test';
      await createLinkType(name);
      const fullName = 'decision/linkTypes/' + name;
      const result = await commandHandler.command(
        Cmd.remove,
        ['linkType', fullName],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('remove link (success)', async () => {
      const linkName = 'test';
      const linkFullName = 'decision/linkTypes/' + linkName;
      await createLinkType(linkName);
      const card = await createCard();
      const cardId = card.affectsCards![0];
      await commandHandler.command(
        Cmd.create,
        ['link', 'decision_5', cardId, linkFullName],
        options,
      );

      const result = await commandHandler.command(
        Cmd.remove,
        ['link', 'decision_5', cardId, linkFullName],
        options,
      );
      expect(result.statusCode).to.equal(200);
    });
    it('remove attachment (success)', async () => {
      const attachment = 'the-needle.heic';
      const attachmentPath = join(testDir, 'attachments' + sep + attachment);
      const card = await createCard();
      const cardId = card.affectsCards![0];
      await commandHandler.command(
        Cmd.create,
        ['attachment', attachmentPath],
        options,
      );
      const attachmentFullName = `${cardId}-${attachment}`;

      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardId, attachmentFullName],
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
    // todo: at some point move to own test file
    it('Remove - remove card (success)', async () => {
      const cardId = 'decision_5';
      const calculateCmd = new Calculate();
      const removeCmd = new Remove(calculateCmd);
      await removeCmd
        .remove(decisionRecordsPath, 'card', cardId)
        .then(() => {
          expect(true);
        })
        .catch(() => {
          expect(false);
        });
    });
  });

  describe('removal attempts - test data is not cleaned', () => {
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
    it('remove template - template missing', async () => {
      const templateName = 'decision/templates/idontexist';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        options,
      );
      expect(result.statusCode).to.equal(400);
    });
    it('remove template - project missing', async () => {
      const templateName = 'decision/templates/simplepage';
      const invalidProject = { projectPath: 'idontexist' };
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', templateName],
        invalidProject,
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
    it('remove() - try to remove unknown type', async () => {
      const cardId = 'decision_5';
      const calculateCmd = new Calculate();
      const removeCmd = new Remove(calculateCmd);
      await removeCmd
        .remove(decisionRecordsPath, 'i-dont-exist', cardId)
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    });
    it('remove() - try to remove non-existing attachment', async () => {
      const cardId = 'decision_5';
      const calculateCmd = new Calculate();
      const removeCmd = new Remove(calculateCmd);
      await removeCmd
        .remove(decisionRecordsPath, 'attachment', cardId, '')
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    });
    it('remove() - try to remove attachment from non-existing card', async () => {
      const cardId = 'decision_999';
      const calculateCmd = new Calculate();
      const removeCmd = new Remove(calculateCmd);
      await removeCmd
        .remove(decisionRecordsPath, 'attachment', cardId, 'the-needle.heic')
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    });
    it('remove() - try to remove non-existing module', async () => {
      const calculateCmd = new Calculate();
      const removeCmd = new Remove(calculateCmd);
      await removeCmd
        .remove(decisionRecordsPath, 'module', 'i-dont-exist')
        .then(() => {
          expect(false);
        })
        .catch(() => {
          expect(true);
        });
    });
  });
});
