import { expect } from 'chai';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { Show } from '../src/show.js';
import { fetchCardDetails } from '../src/interfaces/project-interfaces.js';
import { fileURLToPath } from 'node:url';

describe('show', () => {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const testDir = join(baseDir, 'tmp-show-tests');
    mkdirSync(testDir, { recursive: true });
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    let showCmd: Show;

    before(async () => {
        mkdirSync(testDir, { recursive: true });
        await copyDir('test/test-data/', testDir);
        showCmd = new Show();
    });

    after(() => {
        rmSync(testDir, { recursive: true, force: true });
    });

    it('showAttachments (success)', async () => {
        const results = await showCmd.showAttachments(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showAttachment (success)', async () => {
        const cardId = 'decision_1';
        const attahcmentName = 'the-needle.heic';
        const results = await showCmd.showAttachment(decisionRecordsPath, cardId, attahcmentName);
        expect(results.statusCode).to.equal(200);
    });
    it('showAttachment - empty cardkey', async () => {
        const cardId = '';
        const attahcmentName = 'the-needle.heic';
        const results = await showCmd.showAttachment(decisionRecordsPath, cardId, attahcmentName);
        expect(results.statusCode).to.equal(400);
    });
    it('showAttachment - card does not have particular attachment', async () => {
        const cardId = 'decision_1';
        const attahcmentName = 'i-dont-exist';
        const results = await showCmd.showAttachment(decisionRecordsPath, cardId, attahcmentName);
        expect(results.statusCode).to.equal(400);
    });
    it('showCardDetails (success)', async () => {
        const cardId = 'decision_1';
        const details: fetchCardDetails = { content: true, metadata: true, attachments: true };
        const results = await showCmd.showCardDetails(decisionRecordsPath, details, cardId);
        expect(results.statusCode).to.equal(200);
    });
    it('showCardDetails - empty cardkey', async () => {
        const cardId = '';
        const details: fetchCardDetails = { content: true, metadata: true, attachments: true };
        const results = await showCmd.showCardDetails(decisionRecordsPath, details, cardId);
        expect(results.statusCode).to.equal(400);
    });
    it('showCardDetails - card not in project', async () => {
        const cardId = 'decision_999';
        const details: fetchCardDetails = { content: true, metadata: true, attachments: true };
        const results = await showCmd.showCardDetails(decisionRecordsPath, details, cardId);
        expect(results.statusCode).to.equal(400);
    });
    it('showCards (success)', async () => {
        const results = await showCmd.showCards(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showProjectCards (success)', async () => {
        const results = await showCmd.showProjectCards(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showProjectCards - invalid project path', async () => {
        const results = await showCmd.showProjectCards('');
        expect(results.statusCode).to.equal(500);
    });
    it('showCardTypeDetails (success)', async () => {
        const cardType = 'decision-cardtype';
        const results = await showCmd.showCardTypeDetails(decisionRecordsPath, cardType);
        expect(results.statusCode).to.equal(200);
    });
    it('showCardTypeDetails - empty card-type', async () => {
        const cardType = '';
        const results = await showCmd.showCardTypeDetails(decisionRecordsPath, cardType);
        expect(results.statusCode).to.equal(400);
    });
    it('showCardTypeDetails - card-type does not exist in project', async () => {
        const cardType = 'my-card-type';
        const results = await showCmd.showCardTypeDetails(decisionRecordsPath, cardType);
        expect(results.statusCode).to.equal(400);
    });
    it('showCardTypes (success)', async () => {
        const results = await showCmd.showCardTypes(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showCardTypesWithDetails (success)', async () => {
        const results = await showCmd.showCardTypesWithDetails(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showFieldTypes (success)', async () => {
        const results = await showCmd.showFieldTypes(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showFieldType (success)', async () => {
        const fieldTypeName = 'obsoletedBy';
        const results = await showCmd.showFieldType(decisionRecordsPath, fieldTypeName);
        expect(results.statusCode).to.equal(200);
    });
    // it('showFieldTypes (success)', async () => {
    //     const results = await showCmd.showFieldTypes(decisionRecordsPath);
    //     expect(results.statusCode).to.equal(200);
    // });
    // it('showFieldType (success)', async () => {
    //     const fieldTypeName = 'obsoletedBy';
    //     const results = await showCmd.showFieldType(decisionRecordsPath, fieldTypeName);
    //     expect(results.statusCode).to.equal(200);
    // });
    it('showModule - no module name defined', async () => {
        const moduleName = '';
        const results = await showCmd.showModule(decisionRecordsPath, moduleName);
        expect(results.statusCode).to.equal(400);
    });
    it('showModules (success)', async () => {
        const results = await showCmd.showModules(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showModulesWithDetails (success)', async () => {
        const results = await showCmd.showModulesWithDetails(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showProject (success)', async () => {
        const results = await showCmd.showProject(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showTemplate (success)', async () => {
        const templateName = 'decision';
        const results = await showCmd.showTemplate(decisionRecordsPath, templateName);
        expect(results.statusCode).to.equal(200);
    });
    it('showTemplate - empty template name', async () => {
        const templateName = '';
        const results = await showCmd.showTemplate(decisionRecordsPath, templateName);
        expect(results.statusCode).to.equal(400);
    });
    it('showTemplate - template does not exist in project', async () => {
        const templateName = 'i-dont-exist';
        const results = await showCmd.showTemplate(decisionRecordsPath, templateName);
        expect(results.statusCode).to.equal(400);
    });
    it('showTemplates (success)', async () => {
        const results = await showCmd.showTemplates(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showTemplatesWithDetails (success)', async () => {
        const results = await showCmd.showTemplatesWithDetails(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showWorkflow (success)', async () => {
        const workflowName = 'decision-workflow';
        const results = await showCmd.showWorkflow(decisionRecordsPath, workflowName);
        expect(results.statusCode).to.equal(200);
    });
    it('showWorkflow - empty workflow name', async () => {
        const workflowName = '';
        const results = await showCmd.showWorkflow(decisionRecordsPath, workflowName);
        expect(results.statusCode).to.equal(400);
    });
    it('showWorkflow - workflow does not exist in project', async () => {
        const workflowName = 'i-do-not-exist';
        const results = await showCmd.showWorkflow(decisionRecordsPath, workflowName);
        expect(results.statusCode).to.equal(400);
    });
    it('showWorkflows (success)', async () => {
        const results = await showCmd.showWorkflows(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
    it('showWorkflowsWithDetails (success)', async () => {
        const results = await showCmd.showWorkflowsWithDetails(decisionRecordsPath);
        expect(results.statusCode).to.equal(200);
    });
});