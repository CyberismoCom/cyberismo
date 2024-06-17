import { expect } from 'chai';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { Show } from '../src/show.js';
import { fetchCardDetails } from '../src/interfaces/project-interfaces.js';
import { fileURLToPath } from 'node:url';
import { errorFunction } from '../src/utils/log-utils.js';

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
    expect(results).to.not.equal(undefined);
  });
  it('showAttachment (success)', async () => {
    const cardId = 'decision_1';
    const attahcmentName = 'the-needle.heic';
    const results = await showCmd.showAttachment(
      decisionRecordsPath,
      cardId,
      attahcmentName,
    );
    expect(results).to.not.equal(undefined);
  });
  it('showAttachment - empty cardkey', async () => {
    const cardId = '';
    const attahcmentName = 'the-needle.heic';
    await showCmd
      .showAttachment(decisionRecordsPath, cardId, attahcmentName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Mandatory parameter 'cardKey' missing`,
        ),
      );
  });
  it('showAttachment - card does not have particular attachment', async () => {
    const cardId = 'decision_1';
    const attahcmentName = 'i-dont-exist';
    await showCmd
      .showAttachment(decisionRecordsPath, cardId, attahcmentName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Attachment 'i-dont-exist' not found for card decision_1`,
        ),
      );
  });
  it('showCardDetails (success)', async () => {
    const cardId = 'decision_1';
    const details: fetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    const results = await showCmd.showCardDetails(
      decisionRecordsPath,
      details,
      cardId,
    );
    expect(results).to.not.equal(undefined);
  });
  it('showCardDetails - empty cardkey', async () => {
    const cardId = '';
    const details: fetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    await showCmd
      .showCardDetails(decisionRecordsPath, details, cardId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Mandatory parameter 'cardKey' missing`,
        ),
      );
  });
  it('showCardDetails - card not in project', async () => {
    const cardId = 'decision_999';
    const details: fetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    await showCmd
      .showCardDetails(decisionRecordsPath, details, cardId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Card 'decision_999' does not exist in the project`,
        ),
      );
  });
  it('showCards (success)', async () => {
    const results = await showCmd.showCards(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showProjectCards (success)', async () => {
    const results = await showCmd.showProjectCards(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showProjectCards - invalid project path', async () => {
    await showCmd
      .showProjectCards('')
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Invalid path '.cards${sep}local${sep}cardsconfig.json' to configuration file`,
        ),
      );
  });
  it('showCardTypeDetails (success)', async () => {
    const cardType = 'decision/cardtypes/decision-cardtype';
    const results = await showCmd.showCardTypeDetails(
      decisionRecordsPath,
      cardType,
    );
    expect(results).to.not.equal(undefined);
  });
  it('showCardTypeDetails - empty card-type', async () => {
    const cardType = '';
    await showCmd
      .showCardTypeDetails(decisionRecordsPath, cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define cardtype name to query its details.`,
        ),
      );
  });
  it('showCardTypeDetails - card-type does not exist in project', async () => {
    const cardType = 'my-card-type';
    await showCmd
      .showCardTypeDetails(decisionRecordsPath, cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Cardtype 'my-card-type' not found from the project.`,
        ),
      );
  });
  it('showCardTypes (success)', async () => {
    const results = await showCmd.showCardTypes(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showCardTypesWithDetails (success)', async () => {
    const results = await showCmd.showCardTypesWithDetails(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showFieldTypes (success)', async () => {
    const results = await showCmd.showFieldTypes(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showFieldType (success)', async () => {
    const fieldTypeName = 'decision/fieldtypes/obsoletedBy';
    const results = await showCmd.showFieldType(
      decisionRecordsPath,
      fieldTypeName,
    );
    expect(results).to.not.equal(undefined);
  });

  it('showLinkTypes (success)', async () => {
    const results = await showCmd.showLinkTypes(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showLinkType (success)', async () => {
    const fieldTypeName = 'decision/linktypes/test';
    const results = await showCmd.showLinkType(
      decisionRecordsPath,
      fieldTypeName,
    );
    expect(results).to.not.equal(undefined);
  });
  it('try showLinkType', async () => {
    const linkTypeName = 'test2';

    const results = await showCmd.showLinkType(
      decisionRecordsPath,
      linkTypeName,
    );
    expect(results).to.equal(undefined);
  });
  it('showModule - no module name defined', async () => {
    const moduleName = '';
    await showCmd
      .showModule(decisionRecordsPath, moduleName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Module '' does not exist in the project`,
        ),
      );
  });
  it('showModules (success)', async () => {
    const results = await showCmd.showModules(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showModulesWithDetails (success)', async () => {
    const results = await showCmd.showModulesWithDetails(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showProject (success)', async () => {
    const results = await showCmd.showProject(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showTemplate (success)', async () => {
    const templateName = 'decision/templates/decision';
    const results = await showCmd.showTemplate(
      decisionRecordsPath,
      templateName,
    );
    expect(results).to.not.equal(undefined);
  });
  it('showTemplate - empty template name', async () => {
    const templateName = '';
    await showCmd
      .showTemplate(decisionRecordsPath, templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Template '' does not exist in the project`,
        ),
      );
  });
  it('showTemplate - template does not exist in project', async () => {
    const templateName = 'i-dont-exist';
    await showCmd
      .showTemplate(decisionRecordsPath, templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Template 'i-dont-exist' does not exist in the project`,
        ),
      );
  });
  it('showTemplates (success)', async () => {
    const results = await showCmd.showTemplates(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showTemplatesWithDetails (success)', async () => {
    const results = await showCmd.showTemplatesWithDetails(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showWorkflow (success)', async () => {
    const workflowName = 'decision/workflows/decision-workflow';
    const results = await showCmd.showWorkflow(
      decisionRecordsPath,
      workflowName,
    );
    expect(results).to.not.equal(undefined);
  });
  it('showWorkflow - empty workflow name', async () => {
    const workflowName = '';
    await showCmd
      .showWorkflow(decisionRecordsPath, workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define workflow name to query its details.`,
        ),
      );
  });
  it('showWorkflow - workflow does not exist in project', async () => {
    const workflowName = 'i-do-not-exist';
    await showCmd
      .showWorkflow(decisionRecordsPath, workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Workflow 'i-do-not-exist' not found from the project.`,
        ),
      );
  });
  it('showWorkflows (success)', async () => {
    const results = await showCmd.showWorkflows(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
  it('showWorkflowsWithDetails (success)', async () => {
    const results = await showCmd.showWorkflowsWithDetails(decisionRecordsPath);
    expect(results).to.not.equal(undefined);
  });
});
