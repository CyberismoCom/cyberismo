// testing
import { assert, expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { access } from 'node:fs/promises';
import { constants as fsConstants, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';


// ismo
import { CardsOptions, Commands } from '../src/command-handler.js';
import { copyDir, resolveTilde } from '../src/utils/file-utils.js'
import { Create } from '../src/create.js';
import { attachmentPayload, requestStatus } from '../src/interfaces/request-status-interfaces.js';
import { moduleSettings } from '../src/interfaces/project-interfaces.js';
import { Remove } from '../src/remove.js';
import { Show } from '../src/show.js';
import { Calculate } from '../src/calculate.js';
import { fileURLToPath } from 'node:url';

let commandHandler: Commands;

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-tests');
const testDirForExport = join(baseDir, 'tmp-command-export-tests');

before(async () => {
    commandHandler = new Commands();

    process.on('exit', function () {
        console.log('Tests completed');
    });

    mkdirSync(testDir, { recursive: true });
    mkdirSync(testDirForExport, { recursive: true });
    await copyDir('test/test-data/', testDir);
    await copyDir('test/test-data/', testDirForExport);
})

after(() => {
    rmSync(resolveTilde('~/project-name-unique/'), { recursive: true, force: true });
    rmSync(testDir, { recursive: true, force: true });
    rmSync(testDirForExport, { recursive: true, force: true });
})

describe('validate command', () => {
    it('missing path', async () => {
        let result: requestStatus = { statusCode: 500 };
        try {
            result = await commandHandler.validate('');
            assert(false, 'this should not be reached as the above throws');
        }
        catch (error) {
            // this block is here for linter
        }
        expect(result.statusCode).to.equal(500);
    });
    it('valid schema', async () => {
        const result = await commandHandler.validate(join(testDir, 'valid/decision-records'));
        expect(result.statusCode).to.equal(200);
    });
});

describe('show command', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const options: CardsOptions = { projectPath: decisionRecordsPath };
    it('show attachments - success()', async () => {
        const result = await commandHandler.show('attachments', undefined, options);
        expect(result.statusCode).to.equal(200);
    });
    it('show attachment file', async () => {
        // No commandHandler command for getting attachment files, so using Show directly
        const showCommand = new Show();
        const result = await showCommand.showAttachment(decisionRecordsPath, 'decision_1', 'the-needle.heic');
        expect(result.statusCode).to.equal(200);
        expect(result.payload).to.not.equal(null);
        const payload = result.payload as attachmentPayload;
        expect(payload.fileBuffer).to.not.equal(null);
        expect(payload.mimeType).to.equal('image/heic');
    });
    it('show attachment file, card not found', async () => {
        // No commandHandler command for getting attachment files, so using Show directly
        const showCommand = new Show();
        const result = await showCommand.showAttachment(decisionRecordsPath, 'invalid_key', 'does-not-exist.png');
        expect(result.statusCode).to.equal(400);
    });
    it('show attachment file, file not found', async () => {
        // No commandHandler command for getting attachment files, so using Show directly
        const showCommand = new Show();
        const result = await showCommand.showAttachment(decisionRecordsPath, 'decision_1', 'does-not-exist.png');
        expect(result.statusCode).to.equal(400);
    });
    it('show cards - success()', async () => {
        const result = await commandHandler.show('cards', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.be.greaterThan(1); //project + templates
            const cards = payloadAsArray.map(item => item.cards);
            expect(cards.length).to.be.greaterThan(1);
            expect(cards.at(0)).to.include('decision_5');
        }
    });
    it('show particular card - success()', async () => {
        const result = await commandHandler.show('card', 'decision_5', options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show particular card additional details - success()', async () => {
        options.details = true;
        const result = await commandHandler.show('card', 'decision_5', options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const children = Object(result.payload)['children'];
            expect(children.length).to.equal(1);
        }
    });
    it('show cardtypes - success()', async () => {
        const result = await commandHandler.show('cardtypes', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(2);
            expect(payloadAsArray.at(0)).to.equal('decision-cardtype.json');
            expect(payloadAsArray.at(1)).to.equal('simplepage-cardtype.json');
        }
    });
    it('show particular cardtype - success()', async () => {
        const result = await commandHandler.show('cardtype', 'decision-cardtype', options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show modules (none) - success()', async () => {
        const result = await commandHandler.show('modules', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const modules = Object.values(result.payload);
            expect(modules.length).to.equal(0);
        }
    });
    it('show project - success()', async () => {
        const result = await commandHandler.show('project', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show templates - success()', async () => {
        const result = await commandHandler.show('templates', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(3);
            expect(payloadAsArray.at(0)).to.equal('decision');
            expect(payloadAsArray.at(1)).to.equal('empty');
            expect(payloadAsArray.at(2)).to.equal('simplepage');
        }
    });
    it('show particular template - success()', async () => {
        const result = await commandHandler.show('template', 'decision', options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show template cards - success()', async () => {
        const result = await commandHandler.show('cards', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(4); // project + templates
            const cards = payloadAsArray.map(item => item.cards);
            expect(cards.at(0)).to.include('decision_5');
        }
    });
    it('show workflows - success()', async () => {
        const result = await commandHandler.show('workflows', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(2);
            expect(payloadAsArray.at(0)).to.equal('decision-workflow.json');
            expect(payloadAsArray.at(1)).to.equal('simple-workflow.json');
        }
    });
    it('show particular workflow - success()', async () => {
        const result = await commandHandler.show('workflow', 'decision-workflow', options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    // @todo add test cases for error situations
});

describe('show command with modules', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const minimalPath = join(testDir, 'valid/minimal');
    const options: CardsOptions = { projectPath: decisionRecordsPath };
    const optionsMini: CardsOptions = { projectPath: minimalPath };

    before(async () => {
        // import each project to each other
        await commandHandler.import(minimalPath, 'mini', decisionRecordsPath);
        await commandHandler.import(decisionRecordsPath, 'decision', minimalPath);
    })
    it('show modules - success()', async () => {
        let result = await commandHandler.show('modules', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const modules = Object.values(result.payload);
            expect(modules.at(0)).to.equal('mini');
        }
        result = await commandHandler.show('modules', undefined, optionsMini);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const modules = Object.values(result.payload);
            expect(modules.at(0)).to.equal('decision');
        }
    });
    it('show particular module - success()', async () => {
        const result = await commandHandler.show('module', 'mini', options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const module = result.payload as moduleSettings;
            expect(module.cardkeyPrefix).to.equal('mini');
            expect(module.name).to.equal('minimal');
            expect(module.nextAvailableCardNumber).to.equal(1);
            expect(module.path).to.equal(join(decisionRecordsPath, '.cards', 'modules', 'mini'));
            expect(module.cardtypes).to.include('mini/myCardtype.json');
            expect(module.templates).to.include('mini/test-template');
            expect(module.workflows).to.include('mini/defaultWorkflow.json');
            expect(module.workflows).to.include('mini/minimimal-workflow.json');
        }
    });
    it('show particular card', async () => {
        // Since projects have been imported to each other, all cards can be found from each.
        const result = await commandHandler.show('card', 'decision_1', options);
        const resultFromModule = await commandHandler.show('card', 'decision_1', optionsMini);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
        expect(resultFromModule.statusCode).to.equal(200);
        if (resultFromModule.payload) {
            expect(resultFromModule.payload).to.not.equal(undefined);
        }
    });
    it('show cards', async () => {
        const result = await commandHandler.show('cards', undefined, options);
        const resultFromModule = await commandHandler.show('cards', undefined, optionsMini);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.be.greaterThan(1); //project + templates
            const cards = payloadAsArray.map(item => item.cards);
            expect(cards.length).to.be.greaterThan(1);
            expect(cards.at(0)).to.include('decision_5');
        }
        expect(resultFromModule.statusCode).to.equal(200);
        if (resultFromModule.payload) {
            const payloadAsArray = Object.values(resultFromModule.payload);
            expect(payloadAsArray.length).to.be.greaterThan(1); //project + templates
            const cards = payloadAsArray.map(item => item.cards);
            expect(cards.length).to.be.greaterThan(1);
            expect(cards.at(cards.length - 1)).to.include('decision_2');
        }
    });
    it('show cardtypes', async () => {
        const result = await commandHandler.show('cardtypes', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(3);
            expect(payloadAsArray.at(0)).to.equal('decision-cardtype.json');
            expect(payloadAsArray.at(1)).to.equal('mini/myCardtype.json');
            expect(payloadAsArray.at(2)).to.equal('simplepage-cardtype.json');
        }
        const resultFromModule = await commandHandler.show('cardtypes', undefined, optionsMini);
        expect(resultFromModule.statusCode).to.equal(200);
        if (resultFromModule.payload) {
            const payloadAsArray = Object.values(resultFromModule.payload);
            expect(payloadAsArray.length).to.equal(3);
            expect(payloadAsArray.at(0)).to.equal('decision/decision-cardtype.json');
            expect(payloadAsArray.at(1)).to.equal('decision/simplepage-cardtype.json');
            expect(payloadAsArray.at(2)).to.equal('myCardtype.json');
        }
    });
    it('show templates', async () => {
        const result = await commandHandler.show('templates', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(4);
            expect(payloadAsArray.at(0)).to.equal('decision');
            expect(payloadAsArray.at(1)).to.equal('empty');
            expect(payloadAsArray.at(3)).to.equal('simplepage');
            expect(payloadAsArray.at(2)).to.equal('mini/test-template');
        }
        const resultFromModule = await commandHandler.show('templates', undefined, optionsMini);
        expect(resultFromModule.statusCode).to.equal(200);
        if (resultFromModule.payload) {
            const payloadAsArray = Object.values(resultFromModule.payload);
            expect(payloadAsArray.length).to.equal(4);
            expect(payloadAsArray.at(0)).to.equal('decision/decision');
            expect(payloadAsArray.at(1)).to.equal('decision/empty');
            expect(payloadAsArray.at(2)).to.equal('decision/simplepage');
            expect(payloadAsArray.at(3)).to.equal('test-template');
        }
    });
    it('show workflows', async () => {
        const result = await commandHandler.show('workflows', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(4);
            expect(payloadAsArray.at(0)).to.equal('decision-workflow.json');
            expect(payloadAsArray.at(1)).to.equal('mini/defaultWorkflow.json');
            expect(payloadAsArray.at(2)).to.equal('mini/minimimal-workflow.json');
            expect(payloadAsArray.at(3)).to.equal('simple-workflow.json');
        }
        const resultFromModule = await commandHandler.show('workflows', undefined, optionsMini);
        expect(resultFromModule.statusCode).to.equal(200);
        if (resultFromModule.payload) {
            const payloadAsArray = Object.values(resultFromModule.payload);
            expect(payloadAsArray.length).to.equal(4);
            expect(payloadAsArray.at(0)).to.equal('decision/decision-workflow.json');
            expect(payloadAsArray.at(1)).to.equal('decision/simple-workflow.json');
            expect(payloadAsArray.at(2)).to.equal('defaultWorkflow.json');
            expect(payloadAsArray.at(3)).to.equal('minimimal-workflow.json');
        }
    });
    it('show attachments', async () => {
        const result = await commandHandler.show('attachments', undefined, options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(2);
            expect(payloadAsArray.at(0).card).to.equal('decision_5');
            expect(payloadAsArray.at(0).fileName).to.equal('games.jpg');

        }
        const resultFromModule = await commandHandler.show('attachments', undefined, optionsMini);
        expect(resultFromModule.statusCode).to.equal(200);
        if (resultFromModule.payload) {
            const payloadAsArray = Object.values(resultFromModule.payload);
            expect(payloadAsArray.length).to.equal(1);
            expect(payloadAsArray.at(0).card).to.equal('decision_1');
            expect(payloadAsArray.at(0).fileName).to.equal('the-needle.heic');
        }
    });
});

describe('transition command', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    it('transition to new state - success()', async () => {
        const result = await commandHandler.transition('decision_5', 'Approve', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('transition to new state with multiple "fromStates" - success()', async () => {
        const result = await commandHandler.transition('decision_6', 'Reject', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('transition to new state with wildcard workflow transition - success()', async () => {
        const result = await commandHandler.transition('decision_6', 'Reopen', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('missing project', async () => {
        try {
            await commandHandler.transition('decision_5', 'Created', '');
            assert(false, 'this should not be reached as the above throws');
        }
        catch (error) {
            // missing path (if the project location cannot be deduced) throws
            expect(true);
        }
    });
    it('missing card', async () => {
        const result = await commandHandler.transition('', 'Create', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('wrong state - no such state', async () => {
        const result = await commandHandler.transition('decision_5', 'IDontExist', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('wrong state - illegal transition', async () => {
        // cannot move from approved (earlier test moves state from create to approved) back to created
        const result = await commandHandler.transition('decision_5', 'Create', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('transition to same state', async () => {
        // an error is shown if card is already in a given state
        let result = await commandHandler.transition('decision_6', 'Reject', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
        result = await commandHandler.transition('decision_6', 'Reject', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
});

describe('add command', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    it('add template card (success)', async () => {
        const result = await commandHandler.addCard('decision', 'decision-cardtype', undefined, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('add template card to under a parent (success)', async () => {
        const result = await commandHandler.addCard('decision', 'decision-cardtype', 'decision_1', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('try to add template card to non-existent template', async () => {
        const result = await commandHandler.addCard('idontexists', 'decision-cardtype', undefined, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to add template card to non-existent template parent card', async () => {
        const result = await commandHandler.addCard('decision', 'decision-cardtype', 'decision_999', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to add template card with invalid path', async () => {
        const result = await commandHandler.addCard('decision', 'decision-cardtype', 'decision_999', 'random-path-to-nowehere');
        expect(result.statusCode).to.equal(400);
    });
    it('try to add card with invalid "repeat" value', async () => {
        const result = await commandHandler.addCard('decision', 'decision-cardtype', undefined, decisionRecordsPath, -1);
        expect(result.statusCode).to.equal(400);
    });
});

describe('create command', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const minimalPath = join(testDir, 'valid/minimal');

    // attachment
    it('attachment (success)', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_5';
        const result = await commandHandler.createAttachment(cardId, attachmentPath, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('attachment to template card (success)', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_2';
        const result = await commandHandler.createAttachment(cardId, attachmentPath, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('attachment to child card (success)', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_6';
        const result = await commandHandler.createAttachment(cardId, attachmentPath, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('attachment missing project', async () => {
        const projectPath = join(testDir, 'invalid/i-dont-exist');
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_5';
        const result = await commandHandler.createAttachment(cardId, attachmentPath, projectPath);
        expect(result.statusCode).to.equal(400);
    });
    it('attachment missing card', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_999';
        const result = await commandHandler.createAttachment(cardId, attachmentPath, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('attachment missing attachment', async () => {
        const attachmentPath = join(testDir, 'attachments/i-dont-exist.txt');
        const cardId = 'decision_5';
        const result = await commandHandler.createAttachment(cardId, attachmentPath, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('attachment exists already', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_6';
        let result = await commandHandler.createAttachment(cardId, attachmentPath, decisionRecordsPath);
        result = await commandHandler.createAttachment(cardId, attachmentPath, decisionRecordsPath);
        expect(result.statusCode).to.equal(500);
    });

    // card
    it('card (success)', async () => {
        const result = await commandHandler.createCard('simplepage', undefined, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('card with parent (success)', async () => {
        const templateName = 'decision';
        const parentCard = 'decision_5';
        const result = await commandHandler.createCard(templateName, parentCard, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('card incorrect template name', async () => {
        const templateName = 'i-dont-exist';
        const result = await commandHandler.createCard(templateName, undefined, minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('card missing project', async () => {
        const projectPath = join(testDir, 'valid/no-such-project');
        const templateName = 'simplepage';
        const result = await commandHandler.createCard(templateName, undefined, projectPath);
        expect(result.statusCode).to.equal(400);
    });
    it('card incorrect or missing cardsconfig.json', async () => {
        const projectPath = join(testDir, 'invalid/missing-cardsconfig.json');
        const templateName = 'simplepage';
        const result = await commandHandler.createCard(templateName, undefined, projectPath);
        expect(result.statusCode).to.equal(500);
    });
    it('card invalid cardsconfig.json', async () => {
        const projectPath = join(testDir, 'invalid/invalid-cardsconfig.json');
        const templateName = 'simplepage';
        const result = await commandHandler.createCard(templateName, undefined, projectPath);
        expect(result.statusCode).to.equal(400);
    });
    it('card parent card missing', async () => {
        const parentCard = 'i-dont-exist';
        const result = await commandHandler.createCard('simplepage', parentCard, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    // todo: add more child card creation tests

    // cardtype
    it('cardtype (success)', async () => {
        const result = await commandHandler.createCardtype('test-cardtype', 'defaultWorkflow', minimalPath);
        expect(result.statusCode).to.equal(200);
    });
    it('cardtype invalid project', async () => {
        const result = await commandHandler.createCardtype('test-cardtype', 'defaultWorkflow', join(testDir, 'valid/no-such-project'));
        expect(result.statusCode).to.equal(400);
    });
    it('cardtype create existing cardtype', async () => {
        let result = await commandHandler.createCardtype('test-cardtype', 'defaultWorkflow', minimalPath);
        result = await commandHandler.createCardtype('test-cardtype', 'defaultWorkflow', minimalPath);
        expect(result.statusCode).to.equal(500);
    });
    it('cardtype create no workflow', async () => {
        const result = await commandHandler.createCardtype('test-cardtype', 'i-do-not-exist', minimalPath);
        expect(result.statusCode).to.equal(400);
    });

    // fieldtype
    it('fieldtype all supported types (success)', async () => {
        const fieldTypes = Create.supportedFieldTypes();
        for (const fieldType of fieldTypes) {
            const name = `ft_${fieldType}`;
            const result = await commandHandler.createFieldType(name, fieldType, minimalPath);
            expect(result.statusCode).to.equal(200);
        }
    });
    it('fieldtype invalid project', async () => {
        const result = await commandHandler.createFieldType('name', 'integer', join(testDir, 'valid/no-such-project'));
        expect(result.statusCode).to.equal(400);
    });
    it('fieldtype name already exists', async () => {
        const result1 = await commandHandler.createFieldType('name', 'integer', minimalPath);
        const result2 = await commandHandler.createFieldType('name', 'number', minimalPath);
        expect(result1.statusCode).to.equal(200);
        expect(result2.statusCode).to.equal(400);
    });
    it('fieldtype with invalid name', async () => {
        const result = await commandHandler.createFieldType('name1', 'integer', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('fieldtype with invalid type', async () => {
        const result = await commandHandler.createFieldType('name', 'invalidType', minimalPath);
        expect(result.statusCode).to.equal(400);
    });

    // project
    it('project (success)', async () => {
        const projectDir = join(testDir, 'project-name');
        const result = await commandHandler.createProject(projectDir, 'proj', 'test-project');
        try {
            await access(projectDir, fsConstants.R_OK);
        } catch (error) {
            assert(false, 'project folder could not be created');
        }
        expect(result.statusCode).to.equal(200);
    });
    it('project with user home path (success)', async () => {
        const path = '~/project-name-unique';
        const result = await commandHandler.createProject(path, 'proj', 'test-project');
        try {
            // nodeJS does not automatically expand paths with tilde
            await access(resolveTilde(path), fsConstants.F_OK);
        } catch (error) {
            assert(false, 'project folder could not be created');
        }
        expect(result.statusCode).to.equal(200);
    });
    it('project missing target', async () => {
        const result = await commandHandler.createProject('', '', '');
        expect(result.statusCode).to.equal(400);
    });
    it('project invalid path', async () => {
        const result = await commandHandler.createProject('lpt1', '', '');
        expect(result.statusCode).to.equal(400);
    });
    it('project path already exists', async () => {
        const result = await commandHandler.createProject('.', '', '');
        expect(result.statusCode).to.equal(400);
    });

    // template
    it('template (success)', async () => {
        const result = await commandHandler.createTemplate(
            'template-name_first', '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}', minimalPath);
        expect(result.statusCode).to.equal(200);
    });
    it('template with "local" (success)', async () => {
        const result = await commandHandler.createTemplate(
            'local/template-name_second', '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}', minimalPath);
        expect(result.statusCode).to.equal(200);
    });
    it('template with default parameters (success)', async () => {
        const result = await commandHandler.createTemplate(
            'validname', '', join(testDir, 'valid/minimal'));
        expect(result.statusCode).to.equal(200);
    });
    it('template with "loc"', async () => {
        const result = await commandHandler.createTemplate(
            'loc/template-name_second', '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('template with "123"', async () => {
        const result = await commandHandler.createTemplate(
            'local/123', '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('template invalid project', async () => {
        const result = await commandHandler.createTemplate(
            'validname', '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}', join(testDir, 'no-such-project'));
        expect(result.statusCode).to.equal(400);
    });
    it('template invalid template content', async () => {
        const result = await commandHandler.createTemplate(
            'validname', '{"wrongKey1": "Button1", "wrongKey2": 12}', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('template invalid template name', async () => {
        const result = await commandHandler.createTemplate(
            'aux', '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('template already exists', async () => {
        const result = await commandHandler.createTemplate(
            'decision', '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });

    it('template invalid template name (reserved Windows filename)', async () => {
        const result = await commandHandler.createTemplate(
            'aux', '', join(testDir, 'test-template.json')); //reserved name in Windows
        expect(result.statusCode).to.equal(400);
    });

    // workflow
    it('workflow (success)', async () => {
        const workflowName = "defaultWorkflow";
        const content = `
        {
          "name": "${workflowName}",
          "states": [
              { "name": "Open", "category": "initial" },
              { "name": "In Progress", "category": "active" },
              { "name": "Closed", "category": "closed" }
          ],
          "transitions": [
              {
                  "name": "Create",
                  "fromState": [""],
                  "toState": "Open"
              },
              {
                  "name": "Working",
                  "fromState": ["Open"],
                  "toState": "In Progress"
              },
              {
                  "name": "Done",
                  "fromState": ["*"],
                  "toState": "Closed"
              },
              {
                  "name": "Reopen",
                  "fromState": ["Closed"],
                  "toState": "Open"
              }
          ]
        }`;
        const result = await commandHandler.createWorkflow(workflowName, content, minimalPath);
        expect(result.statusCode).to.equal(200);
    });
    it('workflow with default content (success)', async () => {
        const workflowName = "defaultWorkflow";
        const result = await commandHandler.createWorkflow(workflowName, '', minimalPath);
        expect(result.statusCode).to.equal(200);
    });
    it('workflow invalid workflow schema', async () => {
        const workflowName = "defaultWorkflow";
        const content = `
        {
          "name": "${workflowName}",
          "wrongKey1": "dog",
          "wrongKey2": "cat"
        }`;
        const result = await commandHandler.createWorkflow(workflowName, content, minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('workflow invalid project', async () => {
        const workflowName = "defaultWorkflow";
        const content = `
        {
          "name": "${workflowName}",
          "states": [
              { "name": "Open" },
              { "name": "In Progress" },
              { "name": "Closed" }
          ],
          "transitions": [
              {
                  "name": "Create",
                  "fromState": [""],
                  "toState": "Open"
              },
              {
                  "name": "Working",
                  "fromState": ["Open"],
                  "toState": "In Progress"
              },
              {
                  "name": "Done",
                  "fromState": ["*"],
                  "toState": "Closed"
              },
              {
                  "name": "Reopen",
                  "fromState": ["Closed"],
                  "toState": "Open"
              }
          ]
        }`;
        const result = await commandHandler.createWorkflow(workflowName, content, join(testDir, 'valid/no-such-project'));
        expect(result.statusCode).to.equal(400);
    });
    it('workflow with existing name', async () => {
        const result = await commandHandler.createWorkflow('test-workflow', '', join(testDir, minimalPath));
        expect(result.statusCode).to.equal(400);
    });
    it('access default parameters for template (success)', () => {
        const defaultContent = Create.defaultTemplateContent();
        expect(defaultContent.buttonLabel).to.equal('Button');
        expect(defaultContent.namePrompt).to.equal('Prompt');
    });
    it('access default parameters for workflow (success)', () => {
        const defaultContent = Create.defaultWorkflowContent('test');
        expect(defaultContent.name).to.equal('test');
        expect(defaultContent.states.length).to.equal(3);
        expect(defaultContent.transitions.length).to.equal(3);
    });
});

describe('import command', () => {

    beforeEach(async () => {
        // Ensure that previous imports are removed.
        await commandHandler.remove('module', 'mini', undefined, decisionRecordsPath);
        await commandHandler.remove('module', 'decision', undefined, minimalPath);
    });

    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const minimalPath = join(testDir, 'valid/minimal');

    it('import module (success)', async () => {
        const result = await commandHandler.import(decisionRecordsPath, 'decision', minimalPath);
        expect(result.statusCode).to.equal(200);
    });
    it('try to import module - no source', async () => {
        const result = await commandHandler.import('', 'decision', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to import module - no destination', async () => {
        let result = { statusCode: 0 };
        try {
            result = await commandHandler.import(decisionRecordsPath, 'decision', '');
            assert(false, 'this should not be reached as the above throws');
        }
        catch (error) {
            // this block is here for linter
        }
        expect(result.statusCode).to.equal(0);
    });
    it('try to import module - no name', async () => {
        const result = await commandHandler.import(decisionRecordsPath, '', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to import module - twice the same module', async () => {
        const result1 = await commandHandler.import(decisionRecordsPath, 'decision', minimalPath);
        expect(result1.statusCode).to.equal(200);
        const result2 = await commandHandler.import(decisionRecordsPath, 'decision', minimalPath);
        expect(result2.statusCode).to.equal(400);
    });
    it('try to import module - that has the same prefix', async () => {
        const result = await commandHandler.import(minimalPath, 'mini-too', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('remove imported module', async () => {
        // todo: to implement
    });
});

describe('modifying imported module content is forbidden', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const minimalPath = join(testDir, 'valid/minimal');

    before(async () => {
        // import each project to each other
        await commandHandler.import(minimalPath, 'mini', decisionRecordsPath);
        await commandHandler.import(decisionRecordsPath, 'decision', minimalPath);
    })

    it('try to add card to module template', async () => {
        const result = await commandHandler.addCard('minimal', 'decision-cardtype', undefined, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to add child card to a module card', async () => {
        // try to add new card to decision_2 when 'decision-records' has been imported to 'minimal'
        const result = await commandHandler.addCard('decision', 'decision-cardtype', 'decision_2', minimalPath);
        expect(result.statusCode).to.equal(400);
    });

    it('try to create attachment to a module card', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const result = await commandHandler.createAttachment('decision_2', attachmentPath, minimalPath);
        expect(result.statusCode).to.equal(400);
    });

    it('try to move a module card to another template', async () => {
        const result = await commandHandler.move('decision_2', 'root', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove card from a module template', async () => {
        const result = await commandHandler.remove('card', 'decision_2', undefined, minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove template from a module', async () => {
        const result = await commandHandler.remove('template', 'decision/decision', undefined, minimalPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove attachment from a module card', async () => {
        const result = await commandHandler.remove('attachment', 'decision_1', 'the-needle.heic', minimalPath);
        expect(result.statusCode).to.equal(400);
    });
});

describe('move command', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    it('move card to root (success)', async () => {
        // Create few more cards to play with.
        const done = await commandHandler.createCard('decision', undefined, decisionRecordsPath);
        expect(done.statusCode).to.equal(200);

        const sourceId = 'decision_11';
        const destination = 'root';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('move card to another card (success)', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_10';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });

    it('move child card to another card (success)', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_12';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('move card - project missing', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_12';
        const result = await commandHandler.move(sourceId, destination, 'idontexist');
        expect(result.statusCode).to.equal(400);
    });
    it('move card - source card not found', async () => {
        const sourceId = 'decision_999';
        const destination = 'decision_11';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('move card - destination card not found', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_999';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('move card from template to template', async () => {
        const sourceId = 'decision_2';
        const destination = 'decision_3';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('try to move card from template to project', async () => {
        const sourceId = 'decision_3';
        const destination = 'decision_6';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to move card from project to template', async () => {
        const sourceId = 'decision_6';
        const destination = 'decision_3';
        const result = await commandHandler.move(sourceId, destination, decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
});

describe('remove command', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    it('remove card (success)', async () => {
        const cardId = 'decision_6';
        const result = await commandHandler.remove('card', cardId, '', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('remove card - project missing', async () => {
        const cardId = 'decision_5';
        const result = await commandHandler.remove('card', cardId, '', 'i-dont-exist');
        expect(result.statusCode).to.equal(400);
    });
    it('remove card - card not found', async () => {
        const cardId = 'decision_999';
        const result = await commandHandler.remove('card', cardId, '', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('remove attachment (success)', async () => {
        const cardId = 'decision_5';
        const result = await commandHandler.remove('attachment', cardId, 'the-needle.heic', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('remove attachment - project missing', async () => {
        const cardId = 'decision_5';
        const result = await commandHandler.remove('attachment', cardId, 'the-needle.heic', 'i-dont-exist');
        expect(result.statusCode).to.equal(400);
    });
    it('remove attachment - attachment not found', async () => {
        const cardId = 'decision_5';
        const result = await commandHandler.remove('attachment', cardId, 'i-dont-exist.jpg', decisionRecordsPath);
        expect(result.statusCode).to.equal(500);
    });
    it('remove template (success)', async () => {
        const templateName = 'decision';
        const result = await commandHandler.remove('template', templateName, '', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('remove template - template missing', async () => {
        const templateName = 'decision'; // was deleted in the previous round
        const result = await commandHandler.remove('template', templateName, '', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('remove template - project missing', async () => {
        const templateName = 'simplepage';
        const result = await commandHandler.remove('template', templateName, '', 'i-dont-exist');
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove unknown type', async () => {
        const cardId = 'decision_5';
        const result = await commandHandler.remove('i-dont-exist', cardId, '', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    // todo: at some point move to own test file
    it('remove() - remove card (success)', async () => {
        const cardId = 'decision_5';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        const result = await removeCmd.remove(decisionRecordsPath, 'card', cardId);
        expect(result.statusCode).to.equal(200);
    });
    it('remove() - try to remove unknown type', async () => {
        const cardId = 'decision_5';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        const result = await removeCmd.remove(decisionRecordsPath, 'i-dont-exist', cardId);
        expect(result.statusCode).to.equal(400);
    });
    it('remove() - try to remove non-existing attachment', async () => {
        const cardId = 'decision_5';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        const result = await removeCmd.remove(decisionRecordsPath, 'attachment', cardId, '');
        expect(result.statusCode).to.equal(400);
    });
    it('remove() - try to remove attachment from non-existing card', async () => {
        const cardId = 'decision_999';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        const result = await removeCmd.remove(decisionRecordsPath, 'attachment', cardId, 'the-needle.heic');
        expect(result.statusCode).to.equal(400);
    });
    it('remove() - try to remove non-existing module', async () => {
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        const result = await removeCmd.remove(decisionRecordsPath, 'module', 'i-dont-exist');
        expect(result.statusCode).to.equal(400);
    });
});

describe('rename command', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const minimalPath = join(testDir, 'valid/minimal');
    it('rename project (success)', async () => {
        const result = await commandHandler.rename('decrec', decisionRecordsPath);
        expect(result.statusCode).to.equal(200);
    });
    it('rename project - no cards at all (success)', async () => {
        const result = await commandHandler.rename('empty', minimalPath);
        expect(result.statusCode).to.equal(200);
    });
    it('try to rename project - path missing or invalid', async () => {
        const result = await commandHandler.rename('decrec', 'i-dont-exist');
        expect(result.statusCode).to.equal(400);
    });
    it('try to rename project - "to" missing', async () => {
        const result = await commandHandler.rename('', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
    it('try to rename project - invalid "to" ', async () => {
        const result = await commandHandler.rename('DECREC-2', decisionRecordsPath);
        expect(result.statusCode).to.equal(400);
    });
});