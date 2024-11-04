// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Card } from '../src/interfaces/project-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { Template } from '../src/containers/template.js';

// Create test artifacts in a temp directory.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-template-tests');
let project: Project;
let decisionRecordsPath: string;

before(async () => {
  mkdirSync(testDir);
  await copyDir('test/test-data/', testDir);
  decisionRecordsPath = join(testDir, 'valid/decision-records');
  project = new Project(decisionRecordsPath);
});

after(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('template', () => {
  it('try to create template with no name', () => {
    try {
      new Template(project, { name: '' });
    } catch (error) {
      if (error instanceof Error) {
        expect(error.message).to.contain('Invalid');
      }
    }
  });
  it('list template cards', async () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
    });
    const cards = await template.cards();
    expect(cards.length).to.equal(3);
  });
  it('list template cards from empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
    });
    const cards = await template.cards();
    expect(cards.length).to.equal(0);
  });

  it('try to create all cards from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
    });
    const cards = await template.cards();
    template
      .createCards()
      .then(() => {
        expect(false);
      })
      .catch(async () => {
        const cardsAfter = await template.cards();
        expect(cardsAfter.length).to.equal(cards.length);
      });
  });
  it('create template card to a specific card from a project', async () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
    });

    // Choose specific card so that it does not have currently child cards.
    const fetchCardDetails = {
      children: true,
    };
    const cardBefore = await project.findSpecificCard(
      'decision_6',
      fetchCardDetails,
    );
    expect(cardBefore?.children?.length).to.equal(0);
    await template.createCards(cardBefore);

    // Two direct children should have been created
    const cardAfter = await project.findSpecificCard(
      'decision_6',
      fetchCardDetails,
    );
    expect(cardAfter?.children?.length).to.equal(2);
  });
  it('try to create a specific card from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
    });
    const cards = await template.cards();
    const nonExistingCard: Card = {
      key: '1111',
      path: '',
      content: '',
    };

    await template
      .createCards(nonExistingCard)
      .then(() => {
        expect(false);
      })
      .catch(async () => {
        const cardsAfter = await template.cards();
        expect(cardsAfter.length).to.equal(cards.length);
      });
  });
  it('add new card to a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });
    const cardsBefore = await template.cards();
    await template
      .addCard('decision/cardTypes/decision')
      .then(async () => {
        const cardsAfter = await template.cards();
        expect(cardsBefore.length + 1).to.equal(cardsAfter.length);
      })
      .catch(() => {
        expect(false);
      });
  });
  it('list attachments from a template (no attachments in template)', async () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
    });
    const attachments = await template.attachments();

    expect(attachments.length).to.equal(0);
  });
  it('list attachments from a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });
    const attachments = await template.attachments();

    expect(attachments.length).to.equal(1);
  });
  it('list attachments from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
    });
    const attachments = await template.attachments();
    expect(attachments.length).to.equal(0);
  });
  it('check that template does not exist, then create it', async () => {
    const template = new Template(project, { name: 'idontexistyet' });

    expect(template.isCreated()).to.equal(false);
    const success = await template.create({});
    expect(template.isCreated()).to.equal(true);
    expect(success).to.not.equal(undefined);
  });
  it('check template paths', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });
    const templateMain = template.templateFolder();
    const templateCards = template.templateCardsFolder();
    const configFile = template.templateConfigurationFilePath();
    const specificCardPath = await template.cardFolder('decision_1');
    expect(templateMain).to.contain('.cards');
    expect(join(templateMain, 'c')).to.equal(templateCards);
    expect(templateCards).to.contain(`decision${sep}c`);
    expect(specificCardPath).to.contain(`decision${sep}c${sep}decision_1`);
    expect(configFile).to.contain('template.json');
  });
  it('add card to a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });
    const parentCard: Card = {
      key: 'decision_1',
      path: join(template.templateCardsFolder(), 'decision_1'),
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
  it('access card details by id', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });
    const cardToOperateOn = 'decision_1';
    const cardExists = template.hasCard(cardToOperateOn);
    expect(cardExists).to.equal(true);

    const card = await template.cardDetailsById(cardToOperateOn, {
      metadata: true,
    });
    expect(card).to.not.equal(undefined);
    if (card) {
      expect(card.metadata?.title).to.equal('Untitled');
      expect(card.metadata?.cardType).to.equal('decision/cardTypes/decision');
      expect(card.metadata?.workflowState).to.equal('Draft');
      const templatePath = Project.templatePathFromCardPath(card);
      expect(templatePath).to.not.equal('');
    }
    const details = {
      contentType: 'adoc',
      content: true,
      metadata: true,
      children: true,
      parent: true,
      attachments: true,
    };
    const additionalCardDetails = await template.cardDetailsById(
      cardToOperateOn,
      details,
    );
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
    const template = new Template(project, { name: 'i-dont-exist' });

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
    });
    const parentCard: Card = {
      key: 'i-dont-exist',
      path: join(template.templateCardsFolder(), 'decision_1'),
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
  it('check all the attachments', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });

    // Project can fetch the template's attachment's folder.
    const attachmentFolder1 = await project.cardAttachmentFolder('decision_1');
    const attachmentFolder2 = await template.cardAttachmentFolder('decision_1');
    const nonExistingAttachmentFolder =
      await template.cardAttachmentFolder('decision_999');
    expect(attachmentFolder1).to.include('decision_1');
    expect(attachmentFolder1).to.include(sep + 'a');
    expect(attachmentFolder1).to.equal(attachmentFolder2);

    expect(nonExistingAttachmentFolder).to.equal('');

    const templateAttachments = await template.attachments();
    expect(templateAttachments.length).to.equal(1);

    const details = {
      contentType: 'adoc',
      content: true,
      metadata: true,
      children: true,
      parent: true,
      attachments: true,
    };
    const templateCard = await template.cardDetailsById('decision_1', details);
    if (templateCard) {
      const cardAttachments = templateCard.attachments;
      if (cardAttachments && cardAttachments.length > 0) {
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
    });
    const nonExistingTemplate = new Template(project, { name: 'idontExist' });

    expect(template.isCreated()).to.equal(true);
    expect(nonExistingTemplate.isCreated()).to.equal(false);
  });
  it('find certain card from template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });

    const nonExistingCard = await template.findSpecificCard('idontexist');
    expect(nonExistingCard).to.equal(undefined);

    const existingCard = await template.findSpecificCard('decision_1');
    expect(existingCard).to.not.equal(undefined);
  });
  it('show template details', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });

    const templateProject = template.templateProject;
    expect(templateProject).to.equal(project);

    const templateDetails = await template.show();
    expect(templateDetails.name).to.equal('decision/templates/decision');
    expect(templateDetails.path).includes('.cards');
    expect(templateDetails.path).includes('decision');
    expect(templateDetails.metadata.description).to.equal('description');
    expect(templateDetails.metadata.category).to.equal('category');
    expect(templateDetails.metadata.displayName).to.equal('Decision');
  });
  it('normalize template name', () => {
    const empty = Template.normalizedTemplateName('');
    const localDecision = Template.normalizedTemplateName(
      'local/templates/decision',
    );
    const decision = Template.normalizedTemplateName('decision');
    const invalidName = Template.normalizedTemplateName(
      'more/folders/than/allowed',
    );

    expect(empty).to.equal('');
    expect(localDecision).to.equal('decision');
    expect(decision).to.equal('decision');
    expect(invalidName).to.equal('');
  });
  it('list template cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    const template = new Template(project, {
      name: 'decision/templates/decision',
    });
    const templateCards = await template.listCards();
    expect(templateCards.length).to.be.greaterThan(0);
  });
});
