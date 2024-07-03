// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ismo
import { card } from '../src/interfaces/project-interfaces.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js'
import { Template } from '../src/containers/template.js'
import exp from 'node:constants';

// Create test artifacts in a temp directory.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-template-tests');

before(async () => {
    mkdirSync(testDir);
    await copyDir('test/test-data/', testDir);
});

after(() => {
    rmSync(testDir, { recursive: true, force: true });
});

describe('template', () => {
    it('try to create template with no name', async () => {
        try {
            new Template(path, { name: '' });
        } catch (error) {
            if (error instanceof Error) {
                expect(error.message).to.contain('Invalid');
            }
        }
    });
    const path = join(testDir, 'valid/decision-records');
    it('list template cards', async () => {
        const template = new Template(path, { name: 'simplepage' });
        const cards = await template.cards();
        expect(cards.length).to.equal(3);
    });
    it('list template cards from empty template', async () => {
        const template = new Template(path, { name: 'empty' });
        const cards = await template.cards();
        expect(cards.length).to.equal(0);
    });
    it('create all cards from a template', async () => {
        const template = new Template(path, { name: 'simplepage' });
        const project = template.templateProject;
        const cards = await template.cards();
        const cardsBefore = project.configuration.nextAvailableCardNumber - 1;

        await template.createCards();
        const cardsAfter = project.configuration.nextAvailableCardNumber - 1;
        expect(cardsBefore + cards.length).to.equal(cardsAfter);
    });
    it('try to create all cards from an empty template', async () => {
        const template = new Template(path, { name: 'empty' });
        const cards = await template.cards();
        template.createCards()
        .then(() => {
            expect(false);
        })
        .catch(async () => {
            const cardsAfter = await template.cards();
            expect(cardsAfter.length).to.equal(cards.length);
        });
    });
    it('create template card to a specific card from a project', async () => {
        const template = new Template(path, { name: 'simplepage' });
        const project = template.templateProject;
        const cards = await project.cards()
        const templateCards = await template.cards();

        // Choose specific card so that it does not have currently child cards.
        const specificCard = cards.find(value => value.key === 'decision_6');
        const cardsBefore = project.configuration.nextAvailableCardNumber - 1;

        await template.createCards(specificCard);
        const cardsAfter = project.configuration.nextAvailableCardNumber - 1;

        expect(cardsBefore + templateCards.length).to.equal(cardsAfter);
    });
    it('try to create a specific card from an empty template', async () => {
        const template = new Template(path, { name: 'empty' });
        const cards = await template.cards();
        const nonExistingCard: card = {
            key: '1111',
            path: '',
            content: ''
        };

        await template.createCards(nonExistingCard)
        .then(() => {
            expect(false);
        })
        .catch(async () => {
            const cardsAfter = await template.cards();
            expect(cardsAfter.length).to.equal(cards.length);
        });
    });
    it('add new card to a template', async () => {
        const template = new Template(path, { name: 'decision' });
        const cardsBefore = await template.cards();
        await template.addCard('decision-cardtype')
        .then(async () => {
            const cardsAfter = await template.cards();
            expect(cardsBefore.length + 1).to.equal(cardsAfter.length);
        })
        .catch(() => {
            expect(false);
        });
    });
    it('list attachments from a template (no attachments in template)', async () => {
        const template = new Template(path, { name: 'simplepage' });
        const attachments = await template.attachments();

        expect(attachments.length).to.equal(0);
    });
    it('list attachments from a template', async () => {
        const template = new Template(path, { name: 'decision' });
        const attachments = await template.attachments();

        expect(attachments.length).to.equal(1);
    });
    it('list attachments from an empty template', async () => {
        const template = new Template(path, { name: 'empty' });
        const attachments = await template.attachments();
        expect(attachments.length).to.equal(0);
    });
    it('check that template does not exist, then create it', async () => {
        const template = new Template(path, { name: 'idontexistyet' });

        expect(template.isCreated()).to.equal(false);
        const success = await template.create({ buttonLabel: 'X', namePrompt: 'New template' });
        expect(template.isCreated()).to.equal(true);
        expect(success).to.not.equal(undefined);
    });
    it('check template paths', async () => {
        const template = new Template(path, { name: 'decision' });
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
        const template = new Template(path, { name: 'decision' });
        const parentCard: card = {
            key: 'decision_1',
            path: join(template.templateCardsFolder(), 'decision_1')
        };
        await template.addCard('decision-cardtype', parentCard)
        .then(async () => {
            expect(true);
        })
        .catch(() => {
            expect(false);
        });
    });
    it('access card details by id', async () => {
        const template = new Template(path, { name: 'decision' });
        const cardToOperateOn = 'decision_1';
        const cardExists = template.hasCard(cardToOperateOn);
        expect(cardExists).to.equal(true);

        const card = await template.cardDetailsById(cardToOperateOn, { metadata: true });
        expect(card).to.not.equal(undefined);
        if (card) {
            expect(card.metadata?.summary).to.equal('Untitled');
            expect(card.metadata?.cardtype).to.equal('decision-cardtype');
            expect(card.metadata?.workflowState).to.equal('Draft');
            const templatePath = Project.templatePathFromCardPath(card);
            expect(templatePath).to.not.equal('');
        }
        const details = { contentType: 'adoc', content: true, metadata: true, children: true, parent: true, attachments: true };
        const additionalCardDetails = await template.cardDetailsById(cardToOperateOn, details);
        expect(additionalCardDetails).to.not.equal(undefined);
        if (additionalCardDetails) {
            expect(additionalCardDetails.metadata?.summary).to.equal('Untitled');
            expect(additionalCardDetails.metadata?.cardtype).to.equal('decision-cardtype');
            expect(additionalCardDetails.metadata?.workflowState).to.equal('Draft');
            expect(additionalCardDetails.children?.find(item => item.key === 'decision_14')).to.not.be.undefined;
            expect(additionalCardDetails.parent).to.equal('decision');
            expect(additionalCardDetails.content).to.not.equal(undefined);
        }
    });
    it('add two cards to a template; check project settings', async () => {
        const project = new Project(path);
        const template = new Template(path, { name: 'decision' }, project);
        const setting = project.configuration;
        const startId = setting.nextAvailableCardNumber;

        await template.addCard('decision-cardtype');
        await template.addCard('decision-cardtype');
        const laterId = setting.nextAvailableCardNumber;
        expect(startId + 2).to.equal(laterId);
    });
    it('try to add card to a template that does not exist on disk', async () => {
        const project = new Project(path);
        const template = new Template(path, { name: 'i-dont-exist' }, project);

        await template.addCard('decision-cardtype')
        .then(async () => {
            expect(false);
        })
        .catch(() => {
            expect(true);
        });
    });
    it('try to add card to a template from cardtype that does not exist', async () => {
        const project = new Project(path);
        const template = new Template(path, { name: 'decision' }, project);

        await template.addCard('i-dont-exist')
        .then(async () => {
            expect(false);
        })
        .catch(() => {
            expect(true);
        });
    });
    it('try to add card to a template to a parent card that does not exist', async () => {
        const project = new Project(path);
        const template = new Template(path, { name: 'decision' }, project);
        const parentCard: card = {
            key: 'i-dont-exist',
            path: join(template.templateCardsFolder(), 'decision_1')
        };

        await template.addCard('decision-cardtype', parentCard)
        .then(async () => {
            expect(false);
        })
        .catch(() => {
            expect(true);
        });
    });
    it('check all the attachments', async () => {
        const decisionRecordsPath = join(testDir, 'valid/decision-records');
        const project = new Project(decisionRecordsPath);
        const template = new Template(path, { name: 'decision' }, project);

        // Project can fetch the template's attachment's folder.
        const attachmentFolder1 = await project.cardAttachmentFolder('decision_1');
        const attachmentFolder2 = await template.cardAttachmentFolder('decision_1');
        const nonExistingAttachmentFolder = await template.cardAttachmentFolder('decision_999');
        expect(attachmentFolder1).to.include('decision_1');
        expect(attachmentFolder1).to.include(sep + 'a');
        expect(attachmentFolder1).to.equal(attachmentFolder2);

        expect(nonExistingAttachmentFolder).to.equal('');

        const templateAttachments = await template.attachments();
        expect(templateAttachments.length).to.equal(1);

        const details = { contentType: 'adoc', content: true, metadata: true, children: true, parent: true, attachments: true };
        const templateCard = await template.cardDetailsById('decision_1', details);
        if (templateCard) {
            const cardAttachments = templateCard.attachments;
            if (cardAttachments && cardAttachments.length > 0) {
                expect(cardAttachments.at(0)?.card).to.equal('decision_1');
                expect(cardAttachments.at(0)?.fileName).to.equal('the-needle.heic');
                expect(cardAttachments.at(0)?.path).to.include('decision_1');
                expect(cardAttachments.at(0)?.path).to.include(sep + 'a');
            } else {
                expect(false).to.be.true;
            }
        }
    });
    it('check if template is created', async () => {
        const decisionRecordsPath = join(testDir, 'valid/decision-records');
        const project = new Project(decisionRecordsPath);
        const template = new Template(path, { name: 'decision' }, project);
        const nonExistingTemplate = new Template(path, { name: 'idontExist' }, project);

        expect(template.isCreated()).to.be.true;
        expect(nonExistingTemplate.isCreated()).to.be.false;
    });
    it('find certain card from template', async () => {
        const decisionRecordsPath = join(testDir, 'valid/decision-records');
        const project = new Project(decisionRecordsPath);
        const template = new Template(path, { name: 'decision' }, project);

        const nonExistingCard = await template.findSpecificCard('idontexist');
        expect(nonExistingCard).to.be.undefined;

        const existingCard = await template.findSpecificCard('decision_1');
        expect(existingCard).to.not.equal(undefined);
    });
    it('show template details', async () => {
        const decisionRecordsPath = join(testDir, 'valid/decision-records');
        const project = new Project(decisionRecordsPath);
        const template = new Template(path, { name: 'decision' }, project);

        const templateProject = template.templateProject;
        expect(templateProject).to.equal(project);

        const templateDetails = await template.show();
        expect(templateDetails.name).to.equal('decision');
        expect(templateDetails.path).includes('.cards');
        expect(templateDetails.path).includes('decision');
        expect(templateDetails.project).to.equal(project.projectName);
        expect(templateDetails.metadata.buttonLabel).to.equal('Create a New Decision');
        expect(templateDetails.metadata.namePrompt).to.equal('The title of the new decision:');
        expect(templateDetails.metadata.description).to.equal('description');
        expect(templateDetails.metadata.category).to.equal('category');
        expect(templateDetails.metadata.displayName).to.equal('Decision');
    });
    it('normalize template name', async () => {
        const empty = Template.normalizedTemplateName('');
        const localDecision = Template.normalizedTemplateName('local/decision');
        const decision = Template.normalizedTemplateName('decision');
        const invalidName = Template.normalizedTemplateName('more/folders/than/allowed');

        expect(empty).to.equal('');
        expect(localDecision).to.equal('decision');
        expect(decision).to.equal('decision');
        expect(invalidName).to.equal('');
    });
    it('list template cards', async () => {
        const decisionRecordsPath = join(testDir, 'valid/decision-records');
        const project = new Project(decisionRecordsPath);
        const template = new Template(path, { name: 'decision' }, project);
        const templateCards = await template.listCards();
        expect(templateCards.length).to.be.greaterThan(0);
    });
})
