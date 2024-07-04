// testing
import { assert, expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { access } from 'node:fs/promises';
import { constants as fsConstants, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';


// cyberismo
import { CardsOptions, Cmd, Commands } from '../src/command-handler.js';
import { copyDir, deleteDir, resolveTilde } from '../src/utils/file-utils.js'
import { Create } from '../src/create.js';
import { requestStatus } from '../src/interfaces/request-status-interfaces.js';
import { moduleSettings } from '../src/interfaces/project-interfaces.js';
import { Remove } from '../src/remove.js';
import { Show } from '../src/show.js';
import { Calculate } from '../src/calculate.js';
import { fileURLToPath } from 'node:url';
import { errorFunction } from '../src/utils/log-utils.js';

let commandHandler: Commands;

// Create test artifacts in a temp folder.
const baseDir = dirname(fileURLToPath(import.meta.url));
const testDir = join(baseDir, 'tmp-command-handler-tests');
const testDirForExport = join(baseDir, 'tmp-command-export-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');
const options: CardsOptions = { projectPath: decisionRecordsPath };
const optionsMini: CardsOptions = { projectPath: minimalPath };

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
            result = await commandHandler.command(Cmd.validate, [], { });
            assert(false, 'this should not be reached as the above throws');
        }
        catch (error) {
            // this block is here for linter
        }
        expect(result.statusCode).to.equal(500);
    });
    it('valid schema', async () => {
        const result = await commandHandler.command(
            Cmd.validate, [], { projectPath: join(testDir, 'valid/decision-records') });
        expect(result.statusCode).to.equal(200);
    });
});

describe('show command', () => {
    it('show attachments - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['attachments'], options);
        expect(result.statusCode).to.equal(200);
    });
    it('show attachment file', async () => {
        // No commandHandler command for getting attachment files, so using Show directly
        const showCommand = new Show();
        const result = await showCommand.showAttachment(decisionRecordsPath, 'decision_1', 'the-needle.heic');
        expect(result).to.not.equal(null);
        expect(result.fileBuffer).to.not.equal(null);
        expect(result.mimeType).to.equal('image/heic');
    });
    it('show attachment file, card not found', async () => {
        // No commandHandler command for getting attachment files, so using Show directly
        const showCommand = new Show();
        await showCommand
            .showAttachment(decisionRecordsPath, 'invalid_key', 'does-not-exist.png')
            .catch(error =>
                expect(errorFunction(error)).to.equal(`Card 'invalid_key' does not exist in the project`));
    });
    it('show attachment file, file not found', async () => {
        // No commandHandler command for getting attachment files, so using Show directly
        const showCommand = new Show();
        await showCommand
            .showAttachment(decisionRecordsPath, 'decision_1', 'does-not-exist.png')
            .catch(error =>
                expect(errorFunction(error)).to.equal(`Attachment 'does-not-exist.png' not found for card decision_1`));
    });
    it('show cards - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['cards'], options);
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
        const result = await commandHandler.command(Cmd.show, ['card', 'decision_5'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show particular card additional details - success()', async () => {
        options.details = true;
        const result = await commandHandler.command(Cmd.show, ['card', 'decision_5'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const children = Object(result.payload)['children'];
            expect(children.length).to.equal(1);
        }
    });
    it('show cardtypes - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['cardtypes'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(2);
            expect(payloadAsArray.at(0)).to.equal('decision-cardtype.json');
            expect(payloadAsArray.at(1)).to.equal('simplepage-cardtype.json');
        }
    });
    it('show particular cardtype - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['cardtypes', 'decision-cardtype'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show modules (none) - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['modules'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const modules = Object.values(result.payload);
            expect(modules.length).to.equal(0);
        }
    });
    it('show project - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['project'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show templates - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['templates'], options);
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
        const result = await commandHandler.command(Cmd.show, ['template', 'decision'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    it('show template cards - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['cards'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(4); // project + templates
            const cards = payloadAsArray.map(item => item.cards);
            expect(cards.at(0)).to.include('decision_5');
        }
    });
    it('show workflows - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['workflows'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(2);
            expect(payloadAsArray.at(0)).to.equal('decision-workflow.json');
            expect(payloadAsArray.at(1)).to.equal('simple-workflow.json');
        }
    });
    it('show particular workflow - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['workflow', 'decision-workflow'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
        }
    });
    // @todo add test cases for error situations
});

describe('show command with modules', () => {
    before(async () => {
        // import each project to each other
        await commandHandler.command(Cmd.import, [minimalPath, 'mini'], options);
        await commandHandler.command(Cmd.import, [decisionRecordsPath, 'decision'], optionsMini);
    })
    it('show modules - success', async () => {
        let result = await commandHandler.command(Cmd.show, ['modules'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const modules = Object.values(result.payload);
            expect(modules.at(0)).to.equal('mini');
        }
        result = await commandHandler.command(Cmd.show, ['modules'], optionsMini);
        if (result.payload) {
            expect(result.payload).to.not.equal(undefined);
            const modules = Object.values(result.payload);
            expect(modules.at(0)).to.equal('decision');
        }
    });
    it('show particular module - success()', async () => {
        const result = await commandHandler.command(Cmd.show, ['module', 'mini'], options);
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
        const result = await commandHandler.command(Cmd.show, ['card', 'decision_1'], options);
        const resultFromModule = await commandHandler.command(Cmd.show, ['card', 'decision_1'], optionsMini);
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
        const result = await commandHandler.command(Cmd.show, ['cards'], options);
        const resultFromModule = await commandHandler.command(Cmd.show, ['cards'], optionsMini);
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
        const result = await commandHandler.command(Cmd.show, ['cardtypes'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(3);
            expect(payloadAsArray.at(0)).to.equal('decision-cardtype.json');
            expect(payloadAsArray.at(1)).to.equal('mini/myCardtype.json');
            expect(payloadAsArray.at(2)).to.equal('simplepage-cardtype.json');
        }
        const resultFromModule = await commandHandler.command(Cmd.show, ['cardtypes'], optionsMini);
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
        const result = await commandHandler.command(Cmd.show, ['templates'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(4);
            expect(payloadAsArray.at(0)).to.equal('decision');
            expect(payloadAsArray.at(1)).to.equal('empty');
            expect(payloadAsArray.at(3)).to.equal('simplepage');
            expect(payloadAsArray.at(2)).to.equal('mini/test-template');
        }
        const resultFromModule = await commandHandler.command(Cmd.show, ['templates'], optionsMini);
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
        const result = await commandHandler.command(Cmd.show, ['workflows'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(4);
            expect(payloadAsArray.at(0)).to.equal('decision-workflow.json');
            expect(payloadAsArray.at(1)).to.equal('mini/defaultWorkflow.json');
            expect(payloadAsArray.at(2)).to.equal('mini/minimimal-workflow.json');
            expect(payloadAsArray.at(3)).to.equal('simple-workflow.json');
        }
        const resultFromModule = await commandHandler.command(Cmd.show, ['workflows'], optionsMini);
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
        const result = await commandHandler.command(Cmd.show, ['attachments'], options);
        expect(result.statusCode).to.equal(200);
        if (result.payload) {
            const payloadAsArray = Object.values(result.payload);
            expect(payloadAsArray.length).to.equal(2);
            expect(payloadAsArray.at(0).card).to.equal('decision_5');
            expect(payloadAsArray.at(0).fileName).to.equal('games.jpg');

        }
        const resultFromModule = await commandHandler.command(Cmd.show, ['attachments'], optionsMini);
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
    it('transition to new state - success()', async () => {
        const show = new Show()
        const card = await show.showCardDetails(decisionRecordsPath, { metadata: true }, "decision_5");
        expect(card.metadata?.lastTransitioned).to.equal(undefined);

        const result = await commandHandler.command(Cmd.transition, ['decision_5', 'Approve'], options);

        expect(result.statusCode).to.equal(200);
        const card2 = await show.showCardDetails(decisionRecordsPath, { metadata: true }, "decision_5");
        expect(card2.metadata?.lastTransitioned).to.not.equal(undefined);
    });
    it('transition to new state with multiple "fromStates" - success()', async () => {
        const result = await commandHandler.command(Cmd.transition, ['decision_6', 'Reject'], options);
        expect(result.statusCode).to.equal(200);
    });
    it('transition to new state with wildcard workflow transition - success()', async () => {
        const result = await commandHandler.command(Cmd.transition, ['decision_6', 'Reopen'], options);
        expect(result.statusCode).to.equal(200);
    });
    it('missing project', async () => {
        try {
            await commandHandler.command(Cmd.transition, ['decision_5', 'Created'], {});
            assert(false, 'this should not be reached as the above throws');
        }
        catch (error) {
            // missing path (if the project location cannot be deduced) throws
            expect(true);
        }
    });
    it('missing card', async () => {
        const result = await commandHandler.command(Cmd.transition, ['', 'Create'], options);
        expect(result.statusCode).to.equal(400);
    });
    it('wrong state - no such state', async () => {
        const result = await commandHandler.command(Cmd.transition, ['decision_5', 'IDontExist'], options);
        expect(result.statusCode).to.equal(400);
    });
    it('wrong state - illegal transition', async () => {
        // cannot move from approved (earlier test moves state from create to approved) back to created
        const result = await commandHandler.command(Cmd.transition, ['decision_5', 'Create'], options);
        expect(result.statusCode).to.equal(400);
    });
    it('transition to same state', async () => {
        // an error is shown if card is already in a given state
        let result = await commandHandler.command(Cmd.transition, ['decision_6', 'Reject'], options);
        expect(result.statusCode).to.equal(200);
        result = await commandHandler.command(Cmd.transition, ['decision_6', 'Reject'], options);
        expect(result.statusCode).to.equal(200);
    });
});

describe('add command', () => {
    it('add template card (success)', async () => {
        const result = await commandHandler.command(Cmd.add, ['decision', 'decision-cardtype'], options);
        expect(result.statusCode).to.equal(200);
    });
    it('add template card to under a parent (success)', async () => {
        const result = await commandHandler.command(Cmd.add, ['decision', 'decision-cardtype', 'decision_1'], options);
        expect(result.statusCode).to.equal(200);
    });
    it('try to add template card to non-existent template', async () => {
        const result = await commandHandler.command(Cmd.add, ['idontexists', 'decision-cardtype'], options);
        expect(result.statusCode).to.equal(400);
    });
    it('try to add template card to non-existent template parent card', async () => {
        const result = await commandHandler.command(Cmd.add, ['decision', 'decision-cardtype', 'decision_999'], options);
        expect(result.statusCode).to.equal(400);
    });
    it('try to add template card with invalid path', async () => {
        const result = await commandHandler.command(Cmd.add, ['decision', 'decision-cardtype'], {projectPath: 'random-path'});
        expect(result.statusCode).to.equal(400);
    });
    it('try to add card with invalid "repeat" value', async () => {
        options.repeat = -1;
        const result = await commandHandler.command(Cmd.add, ['decision', 'decision-cardtype'], options);
        expect(result.statusCode).to.equal(400);
    });
});
// todo: no test case with valid repeat number

describe('create command', () => {
    // attachment
    it('attachment (success)', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_5';
        const result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], options);
        expect(result.statusCode).to.equal(200);
    });
    it('attachment to template card (success)', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_2';
        const result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], options);
        expect(result.statusCode).to.equal(200);
    });
    it('attachment to child card (success)', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_6';
        const result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], options);
        expect(result.statusCode).to.equal(200);
    });
    it('attachment missing project', async () => {
        const projectPath = join(testDir, 'invalid/i-dont-exist');
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_5';
        const invalidOptions = {projectPath: projectPath};
        const result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('attachment missing card', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_999';
        const result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], options);
        expect(result.statusCode).to.equal(400);
    });
    it('attachment missing attachment', async () => {
        const attachmentPath = join(testDir, 'attachments/i-dont-exist.txt');
        const cardId = 'decision_5';
        const result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], options);
        expect(result.statusCode).to.equal(400);
    });
    it('attachment exists already', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardId = 'decision_6';
        let result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], options);
        result = await commandHandler.command(Cmd.create, ['attachment', cardId, attachmentPath], options);
        expect(result.statusCode).to.equal(400);
    });

    // card
    it('card (success)', async () => {
        const result = await commandHandler.command(Cmd.create, ['card', 'simplepage'], options);
        expect(result.statusCode).to.equal(200);
    });
    it('card with parent (success)', async () => {
        const templateName = 'decision';
        const parentCard = 'decision_5';
        const result = await commandHandler.command(Cmd.create, ['card', templateName, parentCard ], options);
        expect(result.statusCode).to.equal(200);
    });
    it('card incorrect template name', async () => {
        const templateName = 'i-dont-exist';
        const result = await commandHandler.command(Cmd.create, ['card', templateName ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('card missing project', async () => {
        const templateName = 'simplepage';
        const invalidOptions = { projectPath: join(testDir, 'valid/no-such-project') };
        const result = await commandHandler.command(Cmd.create, ['card', templateName ], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('card incorrect or missing cardsconfig.json', async () => {
        const invalidOptions = { projectPath: join(testDir, 'invalid/missing-cardsconfig.json') };
        const templateName = 'simplepage';
        const result = await commandHandler.command(Cmd.create, ['card', templateName ], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('card invalid cardsconfig.json', async () => {
        const invalidOptions = { projectPath: join(testDir, 'invalid/invalid-cardsconfig.json') };
        const templateName = 'simplepage';
        const result = await commandHandler.command(Cmd.create, ['card', templateName ], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('card parent card missing', async () => {
        const parentCard = 'i-dont-exist';
        const templateName = 'simplepage';
        const result = await commandHandler.command(Cmd.create, ['card', templateName, parentCard ], options);
        expect(result.statusCode).to.equal(400);
    });
    // todo: add more child card creation tests

    // cardtype
    it('cardtype (success)', async () => {
        const cardtype = 'test-cardtype';
        const workflow = 'defaultWorkflow';
        const result = await commandHandler.command(Cmd.create, ['cardtype', cardtype, workflow ], optionsMini);
        expect(result.statusCode).to.equal(200);
    });
    it('cardtype invalid project', async () => {
        const cardtype = 'test-cardtype';
        const workflow = 'defaultWorkflow';
        const invalidOptions = { projectPath: join(testDir, 'valid/no-such-project')};
        const result = await commandHandler.command(Cmd.create, ['cardtype', cardtype, workflow ], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('cardtype create existing cardtype', async () => {
        const cardtype = 'test-cardtype';
        const workflow = 'defaultWorkflow';
        let result = await commandHandler.command(Cmd.create, ['cardtype', cardtype, workflow ], optionsMini);
        result = await commandHandler.command(Cmd.create, ['cardtype', cardtype, workflow ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('cardtype create no workflow', async () => {
        const cardtype = 'test-cardtype';
        const workflow = 'i-do-not-exist';
        const result = await commandHandler.command(Cmd.create, ['cardtype', cardtype, workflow ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });

    // fieldtype
    it('fieldtype all supported types (success)', async () => {
        const fieldTypes = Create.supportedFieldTypes();
        for (const fieldType of fieldTypes) {
            const name = `ft_${fieldType}`;
            const result = await commandHandler.command(Cmd.create, ['fieldtype', name, fieldType ], optionsMini);
            expect(result.statusCode).to.equal(200);
        }
    });
    it('fieldtype invalid project', async () => {
        const name = `name`;
        const dataType = 'integer';
        const invalidOptions = { projectPath: join(testDir, 'valid/no-such-project') };
        const result = await commandHandler.command(Cmd.create, ['fieldtype', name, dataType ], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('fieldtype name already exists', async () => {
        const name = `name`;
        const dataType1 = 'integer';
        const dataType2 = 'number';
        const result1 = await commandHandler.command(Cmd.create, ['fieldtype', name, dataType1 ], optionsMini);
        const result2 = await commandHandler.command(Cmd.create, ['fieldtype', name, dataType2 ], optionsMini);
        expect(result1.statusCode).to.equal(200);
        expect(result2.statusCode).to.equal(400);
    });
    it('fieldtype with invalid name', async () => {
        const name = `name1`;
        const dataType = 'integer';
        const result = await commandHandler.command(Cmd.create, ['fieldtype', name, dataType ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('fieldtype with invalid type', async () => {
        const name = `name1`;
        const dataType = 'invalidType';
        const result = await commandHandler.command(Cmd.create, ['fieldtype', name, dataType ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });

    // project
    it('project (success)', async () => {
        const prefix = 'proj';
        const name = 'test-project';
        const projectDir = join(testDir, name);
        const testOptions: CardsOptions = { projectPath: projectDir };
        const result = await commandHandler.command(Cmd.create, ['project', name, prefix ], testOptions);
        try {
            await access(projectDir, fsConstants.R_OK);
        } catch (error) {
            assert(false, 'project folder could not be created');
        }
        expect(result.statusCode).to.equal(200);
    });
    it('project with user home path (success)', async () => {
        const path = '~/project-name-unique';
        const prefix = 'proj';
        const name = 'test-project';
        const testOptions: CardsOptions = { projectPath: path };

        const result = await commandHandler.command(Cmd.create, ['project', name, prefix ], testOptions);
        try {
            // nodeJS does not automatically expand paths with tilde
            await access(resolveTilde(path), fsConstants.F_OK);
        } catch (error) {
            assert(false, 'project folder could not be created');
        }
        expect(result.statusCode).to.equal(200);
    });
    it('project creation without options (success)', async () => {
        const prefix = 'demo';
        const name = 'demo';
        const testOptions = { projectPath: name };
        const result = await commandHandler.command(Cmd.create, ['project', name, prefix], testOptions);
        expect(result.statusCode).to.equal(200);
        await deleteDir(name);
    });
    it('project missing target', async () => {
        const testOptions = { projectPath: '' };
        const result = await commandHandler.command(Cmd.create, ['project', '', '' ], testOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('project invalid path', async () => {
        const testOptions = { projectPath: 'lpt1' };
        const result = await commandHandler.command(Cmd.create, ['project', '', '' ], testOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('project path already exists', async () => {
        const testOptions = { projectPath: '.' };
        const result = await commandHandler.command(Cmd.create, ['project', '', '' ], testOptions);
        expect(result.statusCode).to.equal(400);
    });

    // template
    it('template (success)', async () => {
        const templateName = 'template-name_first';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], optionsMini);
        expect(result.statusCode).to.equal(200);
    });
    it('template with "local" (success)', async () => {
        const templateName = 'local/template-name_second';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], optionsMini);
        expect(result.statusCode).to.equal(200);
    });
    it('template with default parameters (success)', async () => {
        const templateName = 'validname';
        const templateContent = '';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], optionsMini);
        expect(result.statusCode).to.equal(200);
    });
    it('template with "loc"', async () => {
        const templateName = 'loc/template-name_second';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('template with "123"', async () => {
        const templateName = 'loc/123';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('template invalid project', async () => {
        const templateName = 'validName';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const invalidOptions = {projectPath: join(testDir, 'no-such-project')};
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('template invalid template content', async () => {
        const templateName = 'validname';
        const templateContent = '{"wrongKey1": "Button1", "wrongKey2": 12}';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('template invalid template name', async () => {
        const templateName = 'aux';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('template already exists', async () => {
        const templateName = 'decision';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], options);
        expect(result.statusCode).to.equal(400);
    });
    // todo: same as test on row 701?
    it('template invalid template name (reserved Windows filename)', async () => {
        const templateName = 'aux';
        const templateContent = '{"buttonLabel": "Button1", "namePrompt": "Prompt1"}';
        const testOptions = { projectPath: join(testDir, 'test-template.json') };
        const result = await commandHandler.command(Cmd.create, ['template', templateName, templateContent ], testOptions);
        expect(result.statusCode).to.equal(400);
    });

    // workflow
    it('workflow (success)', async () => {
        const workflowName = "uniqueWorkflowName";
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
        const result = await commandHandler.command(Cmd.create, ['workflow', workflowName, content ], optionsMini);
        expect(result.statusCode).to.equal(200);
    });
    it('workflow with default content (success)', async () => {
        const workflowName = "anotherUniqueWorkflowName";
        const result = await commandHandler.command(Cmd.create, ['workflow', workflowName, '' ], optionsMini);
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
        const result = await commandHandler.command(Cmd.create, ['workflow', workflowName, content ], optionsMini);
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

        const invalidOptions = { projectPath: join(testDir, 'valid/no-such-project') };
        const result = await commandHandler.command(Cmd.create, ['workflow', workflowName, content ], invalidOptions);
        expect(result.statusCode).to.equal(400);
    });
    it('workflow with existing name', async () => {
        const workflowName = "defaultWorkflow";
        const result = await commandHandler.command(Cmd.create, ['workflow', workflowName, '' ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('access default parameters for template (success)', () => {
        const defaultContent = Create.defaultTemplateContent();
        expect(defaultContent.buttonLabel).to.equal('Button');
        expect(defaultContent.namePrompt).to.equal('Prompt');
        expect(defaultContent.displayName).to.equal(undefined);
        expect(defaultContent.category).to.equal(undefined);
        expect(defaultContent.description).to.equal(undefined);
    });
    it('access default parameters for workflow (success)', () => {
        const defaultContent = Create.defaultWorkflowContent('test');
        expect(defaultContent.name).to.equal('test');
        expect(defaultContent.states.length).to.equal(3);
        expect(defaultContent.transitions.length).to.equal(3);
    });
});

describe('import command', () => {
    const type = 'module';
    const miniModule = 'mini';
    const decisionModule = 'decision';

    beforeEach(async () => {
        // Ensure that previous imports are removed.

        await commandHandler.command(Cmd.remove, [type, miniModule ], options);
        await commandHandler.command(Cmd.remove, [type, decisionModule ], optionsMini);
    });

    it('import module (success)', async () => {
        const result = await commandHandler.command(Cmd.import, [decisionRecordsPath, decisionModule ], optionsMini);
        expect(result.statusCode).to.equal(200);
    });
    it('try to import module - no source', async () => {
        const result = await commandHandler.command(Cmd.import, ['', decisionModule ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('try to import module - no destination', async () => {
        let result = { statusCode: 0 };
        const invalidOptions = { projectPath: ''};
        try {
            result = await commandHandler.command(Cmd.import, [decisionRecordsPath, decisionModule ], invalidOptions);
            assert(false, 'this should not be reached as the above throws');
        }
        catch (error) {
            // this block is here for linter
        }
        expect(result.statusCode).to.equal(0);
    });
    it('try to import module - no name', async () => {
        const result = await commandHandler.command(Cmd.import, [decisionRecordsPath, '' ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('try to import module - twice the same module', async () => {
        const result1 = await commandHandler.command(Cmd.import, [decisionRecordsPath, decisionModule ], optionsMini);
        expect(result1.statusCode).to.equal(200);
        const result2 = await commandHandler.command(Cmd.import, [decisionRecordsPath, decisionModule ], optionsMini);
        expect(result2.statusCode).to.equal(400);
    });
    it('try to import module - that has the same prefix', async () => {
        const result = await commandHandler.command(Cmd.import, [minimalPath, 'mini-too' ], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('remove imported module', async () => {
        // todo: to implement
    });
});

describe('modifying imported module content is forbidden', () => {
    const miniModule = 'mini';
    const decisionModule = 'decision';

    before(async () => {
        // import each project to each other
        await commandHandler.command(Cmd.import, [minimalPath, miniModule ], options);
        await commandHandler.command(Cmd.import, [decisionRecordsPath, decisionModule ], optionsMini);
    })

    it('try to add card to module template', async () => {
        const templateName = 'minimal';
        const cardType = 'decision-cardtype';
        const cardKey = '';
        const result = await commandHandler.command(Cmd.add, [templateName, cardType, cardKey ], options);
        // todo: the reason why this fails is due to a bug where templates with names without module
        //       name are the same (one local, one imported)
        expect(result.statusCode).to.equal(400);
    });
    it('try to add child card to a module card', async () => {
        const templateName = 'decision';
        const cardType = 'decision-cardtype';
        const cardKey = 'decision_2';
        // try to add new card to decision_2 when 'decision-records' has been imported to 'minimal'
        const result = await commandHandler.command(Cmd.add, [templateName, cardType, cardKey], optionsMini);
        // todo: the reason why this fails is due to a bug where templates with names without module
        //       name are the same (one local, one imported)
        expect(result.statusCode).to.equal(400);
    });

    it('try to create attachment to a module card', async () => {
        const attachmentPath = join(testDir, 'attachments/the-needle.heic');
        const cardKey = 'decision_2';
        const result = await commandHandler.command(Cmd.create, ['attachment', cardKey, attachmentPath], optionsMini);
        expect(result.statusCode).to.equal(400);
    });

    it('try to move a module card to another template', async () => {
        const cardKey = 'decision_2';
        const result = await commandHandler.command(Cmd.move, ['attachment', cardKey, 'root'], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove card from a module template', async () => {
        const cardKey = 'decision_2';
        const result = await commandHandler.command(Cmd.remove, ['card', cardKey], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove template from a module', async () => {
        const template = 'decision/decision';
        const result = await commandHandler.command(Cmd.remove, ['template', template], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove attachment from a module card', async () => {
        const cardKey = 'decision_1';
        const attachment = 'the-needle.heic';
        const result = await commandHandler.command(Cmd.remove, ['attachment', cardKey, attachment], optionsMini);
        expect(result.statusCode).to.equal(400);
    });
});

describe('move command', () => {
    it('move card to root (success)', async () => {
        // Create few more cards to play with.
        const template = 'decision';
        const parent = '';
        const done = await commandHandler.command(Cmd.create, ['card', template,  parent], options);
        expect(done.statusCode).to.equal(200);

        const sourceId = 'decision_11';
        const destination = 'root';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(200);
    });
    it('move card to another card (success)', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_10';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(200);
    });

    it('move child card to another card (success)', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_12';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(200);
    });
    it('move card - project missing', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_12';
        const invalidProject = { projectPath: 'idontexist' };
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], invalidProject);
        expect(result.statusCode).to.equal(400);
    });
    it('move card - source card not found', async () => {
        const sourceId = 'decision_999';
        const destination = 'decision_11';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(400);
    });
    it('move card - destination card not found', async () => {
        const sourceId = 'decision_11';
        const destination = 'decision_999';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(400);
    });
    it('move card from template to template', async () => {
        const sourceId = 'decision_2';
        const destination = 'decision_3';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(200);
    });
    it('try to move card from template to project', async () => {
        const sourceId = 'decision_3';
        const destination = 'decision_6';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(400);
    });
    it('try to move card from project to template', async () => {
        const sourceId = 'decision_6';
        const destination = 'decision_3';
        const result = await commandHandler.command(Cmd.move, [sourceId,  destination], options);
        expect(result.statusCode).to.equal(400);
    });
});

describe('remove command', () => {
    it('remove card (success)', async () => {
        const cardId = 'decision_6';
        const result = await commandHandler.command(Cmd.remove, ['card', cardId], options);
        expect(result.statusCode).to.equal(200);
    });
    it('remove card - project missing', async () => {
        const cardId = 'decision_5';
        const invalidProject = { projectPath: 'idontexist' };
        const result = await commandHandler.command(Cmd.remove, ['card', cardId], invalidProject);
        expect(result.statusCode).to.equal(400);
    });
    it('remove card - card not found', async () => {
        const cardId = 'decision_999';
        const result = await commandHandler.command(Cmd.remove, ['card', cardId], options);
        expect(result.statusCode).to.equal(400);
    });
    it('remove attachment (success)', async () => {
        const cardId = 'decision_5';
        const attachment = 'the-needle.heic';
        const result = await commandHandler.command(Cmd.remove, ['attachment', cardId, attachment], options);
        expect(result.statusCode).to.equal(200);
    });
    it('remove attachment - project missing', async () => {
        const cardId = 'decision_5';
        const attachment = 'the-needle.heic';
        const invalidProject = { projectPath: 'idontexist' };
        const result = await commandHandler.command(Cmd.remove, ['attachment', cardId, attachment], invalidProject);
        expect(result.statusCode).to.equal(400);
    });
    it('remove attachment - attachment not found', async () => {
        const cardId = 'decision_5';
        const attachment = 'i-dont-exist.jpg';
        const result = await commandHandler.command(Cmd.remove, ['attachment', cardId, attachment], options);
        expect(result.statusCode).to.equal(400);
    });
    it('remove template (success)', async () => {
        const templateName = 'decision';
        const result = await commandHandler.command(Cmd.remove, ['template', templateName], options);
        expect(result.statusCode).to.equal(200);
    });
    it('remove template - template missing', async () => {
        const templateName = 'decision'; // was deleted in the previous round
        const result = await commandHandler.command(Cmd.remove, ['template', templateName], options);
        expect(result.statusCode).to.equal(400);
    });
    it('remove template - project missing', async () => {
        const templateName = 'simplepage';
        const invalidProject = { projectPath: 'idontexist' };
        const result = await commandHandler.command(Cmd.remove, ['template', templateName], invalidProject);
        expect(result.statusCode).to.equal(400);
    });
    it('try to remove unknown type', async () => {
        const cardId = 'decision_5';
        const result = await commandHandler.command(Cmd.remove, ['i-dont-exist', cardId], options);
        expect(result.statusCode).to.equal(400);
    });
    // todo: at some point move to own test file
    it('remove() - remove card (success)', async () => {
        const cardId = 'decision_5';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        await removeCmd.remove(decisionRecordsPath, 'card', cardId)
        .then(() => { expect(true)})
        .catch(() => { expect(false)})
    });
    it('remove() - try to remove unknown type', async () => {
        const cardId = 'decision_5';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        await removeCmd.remove(decisionRecordsPath, 'i-dont-exist', cardId)
        .then(() => { expect(false)})
        .catch(() => { expect(true)})
    });
    it('remove() - try to remove non-existing attachment', async () => {
        const cardId = 'decision_5';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        await removeCmd.remove(decisionRecordsPath, 'attachment', cardId, '')
        .then(() => { expect(false)})
        .catch(() => { expect(true)})
    });
    it('remove() - try to remove attachment from non-existing card', async () => {
        const cardId = 'decision_999';
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        await removeCmd.remove(decisionRecordsPath, 'attachment', cardId, 'the-needle.heic')
        .then(() => { expect(false)})
        .catch(() => { expect(true)})
    });
    it('remove() - try to remove non-existing module', async () => {
        const calculateCmd = new Calculate();
        const removeCmd = new Remove(calculateCmd);
        await removeCmd.remove(decisionRecordsPath, 'module', 'i-dont-exist')
        .then(() => { expect(false)})
        .catch(() => { expect(true)})
    });
});

describe('rename command', () => {
    it('rename project (success)', async () => {
        const newName = 'decrec';
        const result = await commandHandler.command(Cmd.rename, [newName], options);
        expect(result.statusCode).to.equal(200);
    });
    it('rename project - no cards at all (success)', async () => {
        const newName = 'empty';
        const result = await commandHandler.command(Cmd.rename, [newName], optionsMini);
        expect(result.statusCode).to.equal(200);
    });
    it('try to rename project - path missing or invalid', async () => {
        const invalidProject = { projectPath: 'idontexist' };
        const newName = 'decrec';
        const result = await commandHandler.command(Cmd.rename, [newName], invalidProject);
        expect(result.statusCode).to.equal(400);
    });
    it('try to rename project - "to" missing', async () => {
        const newName = '';
        await commandHandler.command(Cmd.rename, [newName], options)
            .catch(error => expect(errorFunction(error)).to.equal("Input validation error: empty 'to' is not allowed"));
    });
    it('try to rename project - invalid "to" ', async () => {
        const newName = 'DECREC-2';
        const result = await commandHandler.command(Cmd.rename, [newName], options);
        expect(result.statusCode).to.equal(400);
    });
});