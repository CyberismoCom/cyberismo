// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';

import type { Card } from '../src/interfaces/project-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { Template } from '../src/containers/template.js';
import { TemplateResource } from '../src/resources/template-resource.js';

// Create test artifacts in a temp directory.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-template-tests');
let project: Project;
let decisionRecordsPath: string;

before(async () => {
  mkdirSync(testDir);
  await copyDir('test/test-data/', testDir);
  decisionRecordsPath = join(testDir, 'valid/decision-records');
  project = new Project(decisionRecordsPath);
  await project.populateCaches();
});

after(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('template', () => {
  it('try to create template with no name', () => {
    expect(() => new Template(project, { name: '', path: '' })).to.throw(
      `Must define resource name to query its details`,
    );
  });
  it('show template cards', () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });
    const cards = template.cards();
    expect(cards.length).to.equal(3);
  });
  it('show template cards from empty template', () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const cards = template.cards();
    expect(cards.length).to.equal(0);
  });

  it('try to create all cards from an empty template', () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const cards = template.cards();
    template
      .createCards()
      .then(() => {
        expect(false);
      })
      .catch(() => {
        const cardsAfter = template.cards();
        expect(cardsAfter.length).to.equal(cards.length);
      });
  });
  it('create template card under a specific card from a project', async () => {
    // Choose specific card so that it does not have currently child cards.
    const cardBefore = project.findCard('decision_6');
    expect(cardBefore?.children?.length).to.equal(0);

    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });

    // Check that created cards are mapped from template cards.
    const createdCards = await template.createCards(cardBefore);
    const templateCards = template.cards();

    expect(
      createdCards.map((item) => item.metadata?.templateCardKey),
    ).to.have.same.members(templateCards.map((item) => item.key));

    // Two direct children should have been created
    const cardAfter = project.findCard('decision_6');
    expect(cardAfter?.children?.length).to.equal(2);
  });
  it('try to create a specific card from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const cards = template.cards();
    const nonExistingCard: Card = {
      key: '1111',
      path: '',
      content: '',
      children: [],
      attachments: [],
    };

    await template
      .createCards(nonExistingCard)
      .then(() => {
        expect(false);
      })
      .catch(() => {
        const cardsAfter = template.cards();
        expect(cardsAfter.length).to.equal(cards.length);
      });
  });
  it('add new card to a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const cardsBefore = template.cards();
    await template
      .addCard('decision/cardTypes/decision')
      .then(() => {
        const cardsAfter = template.cards();
        expect(cardsBefore.length + 1).to.equal(cardsAfter.length);
      })
      .catch(() => {
        expect(false);
      });
  });
  it('list attachments from a template (no attachments in template)', () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });
    const attachments = template.attachments();
    expect(attachments.length).to.equal(0);
  });
  it('list attachments from a template', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const attachments = template.attachments();
    expect(attachments.length).to.equal(1);
  });
  it('list attachments from an empty template', () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const attachments = template.attachments();
    expect(attachments.length).to.equal(0);
  });
  it('check that template does not exist, then create it', async () => {
    const templateName = 'decision/templates/idontexistyet';
    const template = new Template(project, {
      name: templateName,
      path: '',
    });

    expect(template.isCreated()).to.equal(false);

    const templateResource = new TemplateResource(
      project,
      resourceName('decision/templates/idontexistyet'),
    );
    await templateResource
      .create()
      .then(() => {
        expect(true);
      })
      .catch(() => {
        expect(false);
      });
    expect(template.isCreated()).to.equal(true);
  });
  it('check template paths', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const templateMain = template.templateFolder();
    const templateCards = template.templateCardsFolder();
    const specificCardPath = await template.cardFolder('decision_1');
    expect(templateMain).to.contain('.cards');
    expect(join(templateMain, 'c')).to.equal(templateCards);
    expect(templateCards).to.contain(`decision${sep}c`);
    expect(specificCardPath).to.contain(`decision${sep}c${sep}decision_1`);
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
    await template
      .addCard('decision/cardTypes/decision', parentCard)
      .then(() => {
        expect(true);
      })
      .catch(() => {
        expect(false);
      });
  });
  it('access card details by id', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const cardToOperateOn = 'decision_1';
    const cardExists = template.hasTemplateCard(cardToOperateOn);
    expect(cardExists).to.equal(true);

    const card = template.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);
    if (card) {
      expect(card.metadata?.title).to.equal('Untitled');
      expect(card.metadata?.cardType).to.equal('decision/cardTypes/decision');
      expect(card.metadata?.workflowState).to.equal('Draft');
    }
    const additionalCardDetails = template.findCard(cardToOperateOn);
    expect(additionalCardDetails).to.not.equal(undefined);
    if (additionalCardDetails) {
      expect(additionalCardDetails.metadata?.title).to.equal('Untitled');
      expect(additionalCardDetails.metadata?.cardType).to.equal(
        'decision/cardTypes/decision',
      );
      expect(additionalCardDetails.metadata?.workflowState).to.equal('Draft');
      expect(additionalCardDetails.children!.length > 0);
      expect(additionalCardDetails.parent).to.equal('root');
      expect(additionalCardDetails.content).to.not.equal(undefined);
    }
  });
  it('try to add card to a template that does not exist on disk', async () => {
    const template = new Template(project, {
      name: 'i-dont-exist',
      path: '',
    });

    await template
      .addCard('decision/cardTypes/decision')
      .then(() => {
        expect(false);
      })
      .catch(() => {
        expect(true);
      });
  });
  it('try to add card to a template from card type that does not exist', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    await template
      .addCard('i-dont-exist')
      .then(() => {
        expect(false);
      })
      .catch(() => {
        expect(true);
      });
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

    await template
      .addCard('decision/cardTypes/decision', parentCard)
      .then(() => {
        expect(false);
      })
      .catch(() => {
        expect(true);
      });
  });
  it('check all the attachments', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    // Project can fetch the template's attachment's folder.
    const attachmentFolder1 = project.cardAttachmentFolder('decision_1');
    const attachmentFolder2 = template.cardAttachmentFolder('decision_1');
    expect(attachmentFolder1).to.include('decision_1');
    expect(attachmentFolder1).to.include(sep + 'a');
    expect(attachmentFolder1).to.equal(attachmentFolder2);

    expect(() => template.cardAttachmentFolder('decision_999')).to.throw(
      `Card 'decision_999' does not exist in the project`,
    );

    const templateAttachments = template.attachments();
    expect(templateAttachments.length).to.equal(1);
    const templateCard = template.findCard('decision_1');
    if (templateCard) {
      const cardAttachments = templateCard.attachments;
      if (cardAttachments.length > 0) {
        expect(cardAttachments.at(0)?.card).to.equal('decision_1');
        expect(cardAttachments.at(0)?.fileName).to.equal('the-needle.heic');
        expect(cardAttachments.at(0)?.path).to.include('decision_1');
        expect(cardAttachments.at(0)?.path).to.include(sep + 'a');
      } else {
        expect(false);
      }
    }
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

    expect(template.isCreated()).to.equal(true);
    expect(nonExistingTemplate.isCreated()).to.equal(false);
  });
  it('find certain card from template', () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    expect(() => {
      template.findCard('idontexist');
    }).to.throw(`Card 'idontexist' is not part of template`);

    const existingCard = template.findCard('decision_1');
    expect(existingCard).to.not.equal(undefined);
  });
  it('show template details', async () => {
    const template = new TemplateResource(
      project,
      resourceName('decision/templates/decision'),
    );

    const templateDetails = await template.show();
    expect(templateDetails.name).to.equal('decision/templates/decision');
    expect(templateDetails.path).includes('.cards');
    expect(templateDetails.path).includes('decision');
    expect(templateDetails.description).to.equal('description');
    expect(templateDetails.category).to.equal('category');
    expect(templateDetails.displayName).to.equal('Decision');
  });
  it('list template cards with card keys', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const templateCards = template.listCards();
    expect(templateCards.length).to.be.greaterThan(0);
  });
});
