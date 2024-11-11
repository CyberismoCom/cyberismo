import { expect } from 'chai';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { CommandManager } from '../src/command-manager.js';
import { copyDir, writeFileSafe } from '../src/utils/file-utils.js';
import { Show } from '../src/show.js';
import { FetchCardDetails } from '../src/interfaces/project-interfaces.js';
import { fileURLToPath } from 'node:url';
import { errorFunction } from '../src/utils/log-utils.js';
import { writeJsonFile } from '../src/utils/json.js';

describe('show', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-show-tests');
  mkdirSync(testDir, { recursive: true });
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let showCmd: Show;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath);
    showCmd = commands.showCmd;
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('showAttachments (success)', async () => {
    const results = await showCmd.showAttachments();
    expect(results).to.not.equal(undefined);
  });
  it('showAttachment (success)', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'the-needle.heic';
    const results = await showCmd.showAttachment(cardId, attachmentName);
    expect(results).to.not.equal(undefined);
  });
  it('showAttachment - empty card key', async () => {
    const cardId = '';
    const attachmentName = 'the-needle.heic';
    await showCmd
      .showAttachment(cardId, attachmentName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Mandatory parameter 'cardKey' missing`,
        ),
      );
  });
  it('showAttachment - card does not have particular attachment', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'i-dont-exist';
    await showCmd
      .showAttachment(cardId, attachmentName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Attachment 'i-dont-exist' not found for card decision_1`,
        ),
      );
  });
  it('showCardDetails (success)', async () => {
    const cardId = 'decision_1';
    const details: FetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    const results = await showCmd.showCardDetails(details, cardId);
    expect(results).to.not.equal(undefined);
  });
  it('showCardDetails - empty card key', async () => {
    const cardId = '';
    const details: FetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    await showCmd
      .showCardDetails(details, cardId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Mandatory parameter 'cardKey' missing`,
        ),
      );
  });
  it('showCardDetails - card not in project', async () => {
    const cardId = 'decision_999';
    const details: FetchCardDetails = {
      content: true,
      metadata: true,
      attachments: true,
    };
    await showCmd
      .showCardDetails(details, cardId)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Card 'decision_999' does not exist in the project`,
        ),
      );
  });
  it('showCardDetails - empty attachment folder', async () => {
    const details: FetchCardDetails = {
      content: false,
      metadata: true,
      attachments: true,
    };
    const cardRoot = join(decisionRecordsPath, 'cardRoot');
    // First create a test setup where there is a parent and child cards.
    // Parent has empty attachment folder, child has attachment in attachment folder.
    // Use just filesystem operations to create the setup.
    const cardMetadata = {
      title: 'A title',
      cardType: 'decision/cardTypes/decision',
      workflowState: 'Approved',
    };
    // Parent
    const cardIdParent = 'decision_mycard';
    await writeFileSafe(join(cardRoot, cardIdParent, 'index.adoc'), '');
    await writeJsonFile(
      join(cardRoot, cardIdParent, 'index.json'),
      cardMetadata,
    );
    mkdirSync(join(decisionRecordsPath, 'cardRoot', cardIdParent, 'a'));

    // Child
    const cardIChild = 'decision_child';
    await writeFileSafe(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'index.adoc'),
      '',
    );
    await writeJsonFile(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'index.json'),
      cardMetadata,
    );
    await writeFileSafe(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'a', 'image.png'),
      '',
    );

    // Expect that parent has no attachments.
    const parentResult = await showCmd.showCardDetails(details, cardIdParent);
    expect(parentResult.attachments.length).equals(0);

    // Child must have one attachment that is owned by the child.
    const childResult = await showCmd.showCardDetails(details, cardIChild);
    expect(childResult.attachments.length).equals(1);
    const childAttachment = childResult.attachments.at(0);
    expect(childAttachment?.card).equals(cardIChild);

    rmSync(join(cardRoot, cardIdParent), { recursive: true, force: true });
  });
  it('showCards (success)', async () => {
    const results = await showCmd.showCards();
    expect(results).to.not.equal(undefined);
  });
  it('showProjectCards (success)', async () => {
    const results = await showCmd.showProjectCards();
    expect(results).to.not.equal(undefined);
  });
  it('showCardTypeDetails (success)', async () => {
    const cardType = 'decision/cardTypes/decision';
    const results = await showCmd.showCardTypeDetails(cardType);
    expect(results).to.not.equal(undefined);
  });
  it('showCardTypeDetails - no cardType', async () => {
    const cardType = '';
    await showCmd
      .showCardTypeDetails(cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define card type name to query its details.`,
        ),
      );
  });
  it('showCardTypeDetails - card type does not exist in project', async () => {
    const cardType = 'my-card-type';
    await showCmd
      .showCardTypeDetails(cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Card type 'my-card-type' not found from the project.`,
        ),
      );
  });
  it('showCardTypes (success)', async () => {
    const results = await showCmd.showCardTypes();
    expect(results).to.not.equal(undefined);
  });
  it('showCardTypesWithDetails (success)', async () => {
    const results = await showCmd.showCardTypesWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('showFieldTypes (success)', async () => {
    const results = await showCmd.showFieldTypes();
    expect(results).to.not.equal(undefined);
  });
  it('showFieldType (success)', async () => {
    const fieldTypeName = 'decision/fieldTypes/obsoletedBy';
    const results = await showCmd.showFieldType(fieldTypeName);
    expect(results).to.not.equal(undefined);
  });
  it('showFieldType (success)', async () => {
    const fieldTypeName = 'i-do-not-exist';
    await showCmd
      .showFieldType(fieldTypeName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Field type 'i-do-not-exist' not found from the project.`,
        ),
      );
  });
  it('showLinkTypes (success)', async () => {
    const results = await showCmd.showLinkTypes();
    expect(results).to.not.equal(undefined);
  });
  it('showLinkType (success)', async () => {
    const fieldTypeName = 'decision/linkTypes/test';
    const results = await showCmd.showLinkType(fieldTypeName);
    expect(results).to.not.equal(undefined);
  });
  it('try showLinkType', async () => {
    const linkTypeName = 'i-do-not-exist';
    await showCmd
      .showLinkType(linkTypeName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Link type 'i-do-not-exist' not found from the project.`,
        ),
      );
  });
  it('showModule - no module name defined', async () => {
    const moduleName = '';
    await showCmd
      .showModule(moduleName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Module '' does not exist in the project`,
        ),
      );
  });
  it('showModules (success)', async () => {
    const results = await showCmd.showModules();
    expect(results).to.not.equal(undefined);
  });
  it('showModulesWithDetails (success)', async () => {
    const results = await showCmd.showModulesWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('showProject (success)', async () => {
    const results = await showCmd.showProject();
    expect(results).to.not.equal(undefined);
  });
  it('showTemplate (success)', async () => {
    const templateName = 'decision/templates/decision';
    const results = await showCmd.showTemplate(templateName);
    expect(results).to.not.equal(undefined);
  });
  it('showTemplate - empty template name', async () => {
    const templateName = '';
    await showCmd
      .showTemplate(templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Template '' does not exist in the project`,
        ),
      );
  });
  it('showTemplate - template does not exist in project', async () => {
    const templateName = 'i-do-not-exist';
    await showCmd
      .showTemplate(templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Template 'i-do-not-exist' does not exist in the project`,
        ),
      );
  });
  it('showTemplates (success)', async () => {
    const results = await showCmd.showTemplates();
    expect(results).to.not.equal(undefined);
  });
  it('showTemplatesWithDetails (success)', async () => {
    const results = await showCmd.showTemplatesWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('showWorkflow (success)', async () => {
    const workflowName = 'decision/workflows/decision';
    const results = await showCmd.showWorkflow(workflowName);
    expect(results).to.not.equal(undefined);
  });
  it('showWorkflow - empty workflow name', async () => {
    const workflowName = '';
    await showCmd
      .showWorkflow(workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define workflow name to query its details.`,
        ),
      );
  });
  it('showWorkflow - workflow does not exist in project', async () => {
    const workflowName = 'i-do-not-exist';
    await showCmd
      .showWorkflow(workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Workflow 'i-do-not-exist' not found from the project.`,
        ),
      );
  });
  it('showWorkflows (success)', async () => {
    const results = await showCmd.showWorkflows();
    expect(results).to.not.equal(undefined);
  });
  it('showWorkflowsWithDetails (success)', async () => {
    const results = await showCmd.showWorkflowsWithDetails();
    expect(results).to.not.equal(undefined);
  });
});
