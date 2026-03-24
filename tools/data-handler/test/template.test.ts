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
import { Template } from '../src/containers/template.js';
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

describe('template', () => {
  it('try to create template with no name', () => {
    expect(() => new Template(project, { name: '', path: '' })).toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('show template cards', () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });
    const cards = template.cards();
    expect(cards.length).toBe(3);
  });
  it('show template cards from empty template', () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const cards = template.cards();
    expect(cards.length).toBe(0);
  });

  it('throws an error when creating cards from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    await expect(template.createCards()).rejects.toThrow(Error);
    expect(template.cards().length).toBe(0);
  });
  it('create template card under a specific card from a project', async () => {
    // Choose specific card so that it does not have currently child cards.
    const cardBefore = project.findCard('decision_6');
    expect(cardBefore?.children?.length).toBe(0);

    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });

    // Check that created cards are mapped from template cards.
    const createdCards = await template.createCards(cardBefore);
    const templateCards = template.cards();

    expect(
      createdCards.map((item) => item.metadata!.templateCardKey),
    ).to.have.same.members(templateCards.map((item) => item.key));

    // Two direct children should have been created
    const cardAfter = project.findCard('decision_6');
    expect(cardAfter?.children?.length).toBe(2);
  });
  it('throws an error when trying to create a specific card from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const nonExistingCard: Card = {
      key: '1111',
      path: '',
      content: '',
      children: [],
      attachments: [],
    };

    await expect(template.createCards(nonExistingCard)).rejects.toThrow(Error);
    expect(template.cards().length).toBe(0);
  });

  it('creates no cards when the template is not empty and parent is non-existent', async () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });
    const nonExistingCard: Card = {
      key: '1111',
      path: '',
      content: '',
      children: [],
      attachments: [],
    };

    const cardCountBefore = project.cards(project.paths.cardRootFolder).length;

    await expect(template.createCards(nonExistingCard)).rejects.toThrow(Error);

    const cardCountAfter = project.cards(project.paths.cardRootFolder).length;
    expect(cardCountAfter).toBe(cardCountBefore);
  });

  it('add new card to a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const cardsBefore = template.cards();
    await template.addCard('decision/cardTypes/decision');
    const cardsAfter = template.cards();
    expect(cardsBefore.length + 1).toBe(cardsAfter.length);
  });
  it('list attachments from a template (no attachments in template)', () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });
    const attachments = template.attachments();
    expect(attachments.length).toBe(0);
  });
  it('list attachments from a template', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const attachments = template.attachments();
    expect(attachments.length).toBe(1);
  });
  it('list attachments from an empty template', () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const attachments = template.attachments();
    expect(attachments.length).toBe(0);
  });
  it('check that template does not exist, then create it', async () => {
    const templateName = 'decision/templates/idontexistyet';
    const template = new Template(project, {
      name: templateName,
      path: '',
    });

    expect(template.isCreated()).toBe(false);

    const templateResource = project.resources.byType(
      'decision/templates/idontexistyet',
      'templates',
    );
    await templateResource.create();

    expect(template.isCreated()).toBe(true);
  });
  it('check template paths', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const templateMain = template.templateFolder();
    const templateCards = template.templateCardsFolder();
    const specificCardPath = template.cardFolder('decision_1');
    expect(templateMain).toContain('.cards');
    expect(join(templateMain, 'c')).toBe(templateCards);
    expect(templateCards).toContain(`decision${sep}c`);
    expect(specificCardPath).toContain(`decision${sep}c${sep}decision_1`);
  });
  it('add card to a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
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
  it('access card details by id', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const cardToOperateOn = 'decision_1';
    const cardExists = template.hasTemplateCard(cardToOperateOn);
    expect(cardExists).toBe(true);

    const card = template.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();
    expect(card.metadata!.title).toBe('Untitled');
    expect(card.metadata!.cardType).toBe('decision/cardTypes/decision');
    expect(card.metadata!.workflowState).toBe('Draft');
    const additionalCardDetails = template.findCard(cardToOperateOn);
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
    const template = new Template(project, {
      name: 'i-dont-exist',
      path: '',
    });

    await expect(
      template.addCard('decision/cardTypes/decision'),
    ).rejects.toThrow();
  });
  it('try to add card to a template from card type that does not exist', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    await expect(template.addCard('i-dont-exist')).rejects.toThrow();
  });
  it('try to add card to a template to a parent card that does not exist', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
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
  it('check all the attachments', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    // Project can fetch the template's attachment's folder.
    const attachmentFolder1 = project.cardAttachmentFolder('decision_1');
    const attachmentFolder2 = template.cardAttachmentFolder('decision_1');
    expect(attachmentFolder1).toContain('decision_1');
    expect(attachmentFolder1).toContain(sep + 'a');
    expect(attachmentFolder1).toBe(attachmentFolder2);

    expect(() => template.cardAttachmentFolder('decision_999')).toThrow(
      CardNotFoundError,
    );

    const templateAttachments = template.attachments();
    expect(templateAttachments.length).toBe(1);
    const templateCard = template.findCard('decision_1');
    const cardAttachments = templateCard.attachments;
    expect(cardAttachments.at(0)!.card).toBe('decision_1');
    expect(cardAttachments.at(0)!.fileName).toBe('the-needle.heic');
    expect(cardAttachments.at(0)!.path).toContain('decision_1');
    expect(cardAttachments.at(0)!.path).toContain(sep + 'a');
  });
  it('check if template is created', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const nonExistingTemplate = new Template(project, {
      name: 'idontExist',
      path: '',
    });

    expect(template.isCreated()).toBe(true);
    expect(nonExistingTemplate.isCreated()).toBe(false);
  });
  it('find certain card from template', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    expect(() => {
      template.findCard('idontexist');
    }).toThrow(`Card 'idontexist' is not part of template`);

    const existingCard = template.findCard('decision_1');
    expect(existingCard).not.toBeUndefined();
  });
  it('show template details', async () => {
    const template = new TemplateResource(
      project,
      resourceName('decision/templates/decision'),
    );

    const templateDetails = template.show();
    expect(templateDetails.name).toBe('decision/templates/decision');
    expect(templateDetails.path).toContain('.cards');
    expect(templateDetails.path).toContain('decision');
    expect(templateDetails.description).toBe('description');
    expect(templateDetails.category).toBe('category');
    expect(templateDetails.displayName).toBe('Decision');
  });
  it('list template cards with card keys', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const templateCards = template.listCards();
    expect(templateCards.length).toBeGreaterThan(0);
  });
});
