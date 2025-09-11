// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  Card,
  FileContentType,
} from '../src/interfaces/project-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { Template } from '../src/containers/template.js';
import { TemplateResource } from '../src/resources/template-resource.js';

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
    expect(() => new Template(project, { name: '', path: '' })).to.throw(
      `Must define resource name to query its details`,
    );
  });
  it('list template cards', async () => {
    const template = new Template(project, {
      name: 'decision/templates/simplepage',
      path: '',
    });
    const cards = await template.cards();
    expect(cards.length).to.equal(3);
  });
  it('list template cards from empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const cards = await template.cards();
    expect(cards.length).to.equal(0);
  });

  it('try to create all cards from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
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
      path: '',
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

    // Check that created cards are mapped from template cards.
    const createdCards = await template.createCards(cardBefore);
    const templateCards = await template.cards();
    expect(
      createdCards.map((item) => item.metadata?.templateCardKey),
    ).to.have.same.members(templateCards.map((item) => item.key));

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
      path: '',
    });
    const cards = await template.cards();
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
      .catch(async () => {
        const cardsAfter = await template.cards();
        expect(cardsAfter.length).to.equal(cards.length);
      });
  });
  it('add new card to a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
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
      path: '',
    });
    const attachments = await template.attachments();
    expect(attachments.length).to.equal(0);
  });
  it('list attachments from a template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const attachments = await template.attachments();
    expect(attachments.length).to.equal(1);
  });
  it('list attachments from an empty template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/empty',
      path: '',
    });
    const attachments = await template.attachments();
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
    const configFile = template.templateConfigurationFilePath();
    const specificCardPath = await template.cardFolder('decision_1');
    expect(templateMain).to.contain('.cards');
    expect(join(templateMain, 'c')).to.equal(templateCards);
    expect(templateCards).to.contain(`decision${sep}c`);
    expect(specificCardPath).to.contain(`decision${sep}c${sep}decision_1`);
    expect(configFile).to.contain('decision.json');
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
  it('access card details by id', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
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
    }
    const details = {
      contentType: 'adoc' as FileContentType,
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
  it('check all the attachments', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    // Project can fetch the template's attachment's folder.
    const attachmentFolder1 = await project.cardAttachmentFolder('decision_1');
    const attachmentFolder2 = await template.cardAttachmentFolder('decision_1');
    expect(attachmentFolder1).to.include('decision_1');
    expect(attachmentFolder1).to.include(sep + 'a');
    expect(attachmentFolder1).to.equal(attachmentFolder2);

    await expect(
      template.cardAttachmentFolder('decision_999'),
    ).to.be.rejectedWith(`Template card 'decision_999' not found`);

    const templateAttachments = await template.attachments();
    expect(templateAttachments.length).to.equal(1);

    const details = {
      contentType: 'adoc' as FileContentType,
      content: true,
      metadata: true,
      children: true,
      parent: true,
      attachments: true,
    };
    const templateCard = await template.cardDetailsById('decision_1', details);
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
  it('find certain card from template', async () => {
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });

    const nonExistingCard = await template.findSpecificCard('idontexist');
    expect(nonExistingCard).to.equal(undefined);

    const existingCard = await template.findSpecificCard('decision_1');
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
    expect(templateDetails.metadata.description).to.equal('description');
    expect(templateDetails.metadata.category).to.equal('category');
    expect(templateDetails.metadata.displayName).to.equal('Decision');
  });
  it('list template cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    const template = new Template(project, {
      name: 'decision/templates/decision',
      path: '',
    });
    const templateCards = await template.listCards();
    expect(templateCards.length).to.be.greaterThan(0);
  });
});
