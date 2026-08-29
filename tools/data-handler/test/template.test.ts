// testing
import { expect, describe, it, afterAll, beforeAll } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';

import type { Card } from '../src/interfaces/project-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import type { Project } from '../src/containers/project.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { TemplateResource } from '../src/resources/template-resource.js';
import { CardNotFoundError } from '../src/exceptions/index.js';

// Create test artifacts in a temp directory.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-template-tests');
let project: Project;
let decisionRecordsPath: string;

beforeAll(async () => {
  mkdirSync(testDir);
  await copyDir('test/test-data/', testDir);
  decisionRecordsPath = join(testDir, 'valid/decision-records');
  project = getTestProject(decisionRecordsPath);
  await project.populateCaches();
});

afterAll(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// The template resource for a name. Templates the fixture does not have are
// constructed directly: resources.byType only knows the ones on disk.
function templateOf(name: string): TemplateResource {
  return new TemplateResource(project, resourceName(name));
}

describe('template', () => {
  it('try to create template with no name', () => {
    expect(() => templateOf('')).toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('show template cards', async () => {
    const template = templateOf('decision/templates/simplepage');
    const cards = await template.templateCards();
    expect(cards.length).toBe(3);
  });
  it('show template cards from empty template', async () => {
    const template = templateOf('decision/templates/empty');
    const cards = await template.templateCards();
    expect(cards.length).toBe(0);
  });

  it('throws an error when creating cards from an empty template', async () => {
    const template = templateOf('decision/templates/empty');
    await expect(template.createCards()).rejects.toThrow(Error);
    expect((await template.templateCards()).length).toBe(0);
  });
  it('create template card under a specific card from a project', async () => {
    // Choose specific card so that it does not have currently child cards.
    const cardBefore = await project.findCard('decision_6');
    expect(cardBefore?.children?.length).toBe(0);

    const template = templateOf('decision/templates/simplepage');

    // Check that created cards are mapped from template cards.
    const createdCards = await template.createCards(cardBefore);
    const templateCards = await template.templateCards();

    expect(
      createdCards.map((item) => item.metadata!.templateCardKey),
    ).to.have.same.members(templateCards.map((item) => item.key));

    // Two direct children should have been created
    const cardAfter = await project.findCard('decision_6');
    expect(cardAfter?.children?.length).toBe(2);
  });
  it('throws an error when trying to create a specific card from an empty template', async () => {
    const template = templateOf('decision/templates/empty');
    const nonExistingCard: Card = {
      key: '1111',
      path: '',
      content: '',
      children: [],
      attachments: [],
    };

    await expect(template.createCards(nonExistingCard)).rejects.toThrow(Error);
    expect((await template.templateCards()).length).toBe(0);
  });

  it('creates no cards when the template is not empty and parent is non-existent', async () => {
    const template = templateOf('decision/templates/simplepage');
    const nonExistingCard: Card = {
      key: '1111',
      path: '',
      content: '',
      children: [],
      attachments: [],
    };

    const cardCountBefore = (await project.cardTree.cards()).length;

    await expect(template.createCards(nonExistingCard)).rejects.toThrow(Error);

    const cardCountAfter = (await project.cardTree.cards()).length;
    expect(cardCountAfter).toBe(cardCountBefore);
  });

  it('add new card to a template', async () => {
    const template = templateOf('decision/templates/decision');
    const cardsBefore = await template.templateCards();
    await template.addCard('decision/cardTypes/decision');
    const cardsAfter = await template.templateCards();
    expect(cardsBefore.length + 1).toBe(cardsAfter.length);
  });
  it('list attachments from a template (no attachments in template)', () => {
    const template = templateOf('decision/templates/simplepage');
    const attachments = template.templateAttachments();
    expect(attachments.length).toBe(0);
  });
  it('list attachments from a template', () => {
    const template = templateOf('decision/templates/decision');
    const attachments = template.templateAttachments();
    expect(attachments.length).toBe(1);
  });
  it('list attachments from an empty template', () => {
    const template = templateOf('decision/templates/empty');
    const attachments = template.templateAttachments();
    expect(attachments.length).toBe(0);
  });
  it('check that template does not exist, then create it', async () => {
    const templateName = 'decision/templates/idontexistyet';
    const template = templateOf(templateName);

    expect(template.isCreated()).toBe(false);

    const templateResource = project.resources.byType(
      'decision/templates/idontexistyet',
      'templates',
    );
    await templateResource.create();

    expect(template.isCreated()).toBe(true);
  });
  it('check template paths', async () => {
    const template = templateOf('decision/templates/decision');
    const templateMain = template.templateFolder();
    const templateCards = template.templateCardsFolder();
    const specificCardPath = template.cardFolder('decision_1');
    expect(templateMain).toContain('.cards');
    expect(join(templateMain, 'c')).toBe(templateCards);
    expect(templateCards).toContain(`decision${sep}c`);
    expect(specificCardPath).toContain(`decision${sep}c${sep}decision_1`);
  });
  it('add card to a template', async () => {
    const template = templateOf('decision/templates/decision');
    const parentCard: Card = {
      key: 'decision_1',
      path: join(template.templateCardsFolder(), 'decision_1'),
      children: [],
      attachments: [],
    };
    await expect(
      template.addCard('decision/cardTypes/decision', parentCard),
    ).resolves.not.toThrow();
  });
  it('access card details by id', async () => {
    const template = templateOf('decision/templates/decision');
    const cardToOperateOn = 'decision_1';
    const cardExists = template.hasTemplateCard(cardToOperateOn);
    expect(cardExists).toBe(true);

    const card = await template.templateCard(cardToOperateOn);
    expect(card).not.toBeUndefined();
    expect(card.metadata!.title).toBe('Untitled');
    expect(card.metadata!.cardType).toBe('decision/cardTypes/decision');
    expect(card.metadata!.workflowState).toBe('Draft');
    const additionalCardDetails = await template.templateCard(cardToOperateOn);
    expect(additionalCardDetails).not.toBeUndefined();
    expect(additionalCardDetails.metadata!.title).toBe('Untitled');
    expect(additionalCardDetails.metadata!.cardType).toBe(
      'decision/cardTypes/decision',
    );
    expect(additionalCardDetails.metadata!.workflowState).toBe('Draft');
    expect(additionalCardDetails.children!.length > 0);
    expect(additionalCardDetails.parent).toBe('root');
    expect(additionalCardDetails.content).not.toBeUndefined();
  });
  it('try to add card to a template that does not exist on disk', async () => {
    const template = templateOf('i-dont-exist');

    await expect(
      template.addCard('decision/cardTypes/decision'),
    ).rejects.toThrow();
  });
  it('try to add card to a template from card type that does not exist', async () => {
    const template = templateOf('decision/templates/decision');

    await expect(template.addCard('i-dont-exist')).rejects.toThrow();
  });
  it('try to add card to a template to a parent card that does not exist', async () => {
    const template = templateOf('decision/templates/decision');
    const parentCard: Card = {
      key: 'i-dont-exist',
      path: join(template.templateCardsFolder(), 'decision_1'),
      children: [],
      attachments: [],
    };

    await expect(
      template.addCard('decision/cardTypes/decision', parentCard),
    ).rejects.toThrow();
  });
  it('check all the attachments', async () => {
    const template = templateOf('decision/templates/decision');

    // Project can fetch the template's attachment's folder.
    const attachmentFolder1 = project.cardAttachmentFolder('decision_1');
    const attachmentFolder2 = template.cardAttachmentFolder('decision_1');
    expect(attachmentFolder1).toContain('decision_1');
    expect(attachmentFolder1).toContain(sep + 'a');
    expect(attachmentFolder1).toBe(attachmentFolder2);

    expect(() => template.cardAttachmentFolder('decision_999')).toThrow(
      CardNotFoundError,
    );

    const templateAttachments = template.templateAttachments();
    expect(templateAttachments.length).toBe(1);
    const templateCard = await template.templateCard('decision_1');
    const cardAttachments = templateCard.attachments;
    expect(cardAttachments.at(0)!.card).toBe('decision_1');
    expect(cardAttachments.at(0)!.fileName).toBe('the-needle.heic');
    expect(cardAttachments.at(0)!.path).toContain('decision_1');
    expect(cardAttachments.at(0)!.path).toContain(sep + 'a');
  });
  it('check if template is created', () => {
    const template = templateOf('decision/templates/decision');
    const nonExistingTemplate = templateOf('idontExist');

    expect(template.isCreated()).toBe(true);
    expect(nonExistingTemplate.isCreated()).toBe(false);
  });
  it('find certain card from template', async () => {
    const template = templateOf('decision/templates/decision');

    await expect(template.templateCard('idontexist')).rejects.toThrow(
      `Card 'idontexist' is not part of template`,
    );

    const existingCard = await template.templateCard('decision_1');
    expect(existingCard).not.toBeUndefined();
  });
  it('show template details', async () => {
    const template = templateOf('decision/templates/decision');

    const templateDetails = template.show();
    expect(templateDetails.name).toBe('decision/templates/decision');
    expect(templateDetails.path).toContain('.cards');
    expect(templateDetails.path).toContain('decision');
    expect(templateDetails.description).toBe('description');
    expect(templateDetails.category).toBe('category');
    expect(templateDetails.displayName).toBe('Decision');
  });
  it('list template cards with card keys', async () => {
    const template = templateOf('decision/templates/decision');
    const templateCards = await template.templateCards();
    expect(templateCards.length).toBeGreaterThan(0);
  });
});
