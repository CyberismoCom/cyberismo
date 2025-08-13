import { expect } from 'chai';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';

import { CommandManager } from '../src/command-manager.js';
import { copyDir, writeFileSafe } from '../src/utils/file-utils.js';
import { errorFunction } from '../src/utils/log-utils.js';
import type { FetchCardDetails } from '../src/interfaces/project-interfaces.js';
import { fileURLToPath } from 'node:url';
import type { Show } from '../src/commands/index.js';
import { writeJsonFile } from '../src/utils/json.js';
import { resourceName } from '../src/resources/file-resource.js';

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
    const cardIdParent = 'decision_my_card';
    await writeFileSafe(join(cardRoot, cardIdParent, 'index.adoc'), '');
    const parentWrite = await writeJsonFile(
      join(cardRoot, cardIdParent, 'index.json'),
      cardMetadata,
    );
    expect(parentWrite).to.equal(true);
    mkdirSync(join(decisionRecordsPath, 'cardRoot', cardIdParent, 'a'));

    // Child
    const cardIChild = 'decision_child';
    await writeFileSafe(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'index.adoc'),
      '',
    );
    const childWrite = await writeJsonFile(
      join(cardRoot, cardIdParent, 'c', cardIChild, 'index.json'),
      cardMetadata,
    );
    expect(childWrite).to.equal(true);
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
  it('showResource - card type (success)', async () => {
    const cardType = 'decision/cardTypes/decision';
    const results = await showCmd.showResource(cardType);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - empty cardType', async () => {
    const cardType = '';
    await showCmd
      .showResource(cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define resource name to query its details`,
        ),
      );
  });
  it('showResource - card type does not exist in project', async () => {
    const cardType = 'decision/cardTypes/my-card-type';
    await showCmd
      .showResource(cardType)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `CardType '${cardType}' does not exist in the project`,
        ),
      );
  });
  it('showCardTypesWithDetails (success)', async () => {
    const results = await showCmd.showCardTypesWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('showResource - field type (success)', async () => {
    const fieldTypeName = 'decision/fieldTypes/obsoletedBy';
    const results = await showCmd.showResource(fieldTypeName);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - field type does not exist', async () => {
    const fieldTypeName = 'decision/fieldTypes/i-do-not-exist';
    await showCmd
      .showResource(fieldTypeName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `FieldType '${fieldTypeName}' does not exist in the project`,
        ),
      );
  });
  it('showResource - link type (success)', async () => {
    const fieldTypeName = 'decision/linkTypes/test';
    const results = await showCmd.showResource(fieldTypeName);
    expect(results).to.not.equal(undefined);
  });
  it('try showResource - link type does not exist', async () => {
    const linkTypeName = 'decision/linkTypes/i-do-not-exist';
    await showCmd
      .showResource(linkTypeName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `LinkType '${linkTypeName}' does not exist in the project`,
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
  it('showProject (success)', async () => {
    const results = await showCmd.showProject();
    expect(results).to.not.equal(undefined);
  });
  it('showResource - template (success)', async () => {
    const templateName = 'decision/templates/decision';
    const results = await showCmd.showResource(templateName);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - template with no name', async () => {
    const templateName = '';
    await showCmd
      .showResource(templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define resource name to query its details`,
        ),
      );
  });
  it('showResource - template does not exist in project', async () => {
    const templateName = 'i-do-not-exist';
    await showCmd
      .showResource(templateName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Name '${templateName}' is not valid resource name`,
        ),
      );
  });
  it('showResources - valid types', async () => {
    const validResourceTypes = [
      'cardTypes',
      'fieldTypes',
      'graphViews',
      'graphModels',
      'linkTypes',
      'reports',
      'templates',
      'workflows',
    ];
    for (const type of validResourceTypes) {
      const results = await showCmd.showResources(type);
      expect(results).to.not.equal(undefined);
    }
  });
  it('showResources - invalid type', async () => {
    const validResourceTypes = ['unknown'];
    for (const type of validResourceTypes) {
      const results = await showCmd.showResources(type);
      expect(results.length).to.equal(0);
    }
  });
  it('showTemplatesWithDetails (success)', async () => {
    const results = await showCmd.showTemplatesWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('showResource - workflow (success)', async () => {
    const workflowName = 'decision/workflows/decision';
    const results = await showCmd.showResource(workflowName);
    expect(results).to.not.equal(undefined);
  });
  it('showResource - empty workflow name', async () => {
    const workflowName = '';
    await showCmd
      .showResource(workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Must define resource name to query its details`,
        ),
      );
  });
  it('showResource - workflow does not exist in project', async () => {
    const workflowName = 'decision/workflows/i-do-not-exist';
    await showCmd
      .showResource(workflowName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Workflow '${workflowName}' does not exist in the project`,
        ),
      );
  });
  it('showWorkflowsWithDetails (success)', async () => {
    const results = await showCmd.showWorkflowsWithDetails();
    expect(results).to.not.equal(undefined);
  });
  it('show report results', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await commands.project.calculationEngine.generate();
    const results = await showCmd.showReportResults(
      parameters.name,
      parameters.parameters.cardKey,
      parameters,
      'localApp',
    );
    expect(results).to.not.equal(undefined);
    expect(results).to.include('xref');
  });
  it('show report results - results to a file', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await commands.project.calculationEngine.generate();
    const results = await showCmd.showReportResults(
      parameters.name,
      parameters.parameters.cardKey,
      parameters,
      'localApp',
      join(testDir, 'report-results.txt'),
    );
    expect(results).equal('');
    const fileContent = await readFile(join(testDir, 'report-results.txt'));
    expect(fileContent.toString()).to.include('xref');
  });
  it('show report results - results to a file', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await commands.project.calculationEngine.generate();
    const results = await showCmd.showReportResults(
      parameters.name,
      parameters.parameters.cardKey,
      parameters,
      'localApp',
      join(testDir, 'report-results.txt'),
    );
    expect(results).equal('');
    const fileContent = await readFile(join(testDir, 'report-results.txt'));
    expect(fileContent.toString()).to.include('xref');
  });
  it('try show report results - report does not exist', async () => {
    const parameters = {
      name: 'decision/reports/wrongReport',
      parameters: {
        wrongKey: 'blaah',
      },
    };
    await commands.project.calculationEngine.generate();
    await expect(
      showCmd.showReportResults(
        parameters.name,
        'wrong',
        parameters,
        'localApp',
      ),
    ).to.be.rejectedWith(
      `Report 'decision/reports/wrongReport' does not exist`,
    );
  });

  it('showFile (success)', async () => {
    const resourceNameStr = 'decision/reports/anotherReport';
    const fileName = 'index.adoc.hbs';
    const result = await showCmd.showFile(
      resourceName(resourceNameStr),
      fileName,
    );
    expect(result).to.not.equal(undefined);
    expect(result).to.be.a('string');
    expect(result.length).to.be.greaterThan(0);
  });

  it('showFile - resource does not exist', async () => {
    const resourceNameStr = 'decision/reports/nonExistentReport';
    const fileName = 'index.adoc.hbs';
    await showCmd
      .showFile(resourceName(resourceNameStr), fileName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' does not exist in the project`,
        ),
      );
  });

  it('showFile - resource is not a folder resource', async () => {
    const resourceNameStr = 'decision/cardTypes/decision';
    const fileName = 'some-file.txt';
    await showCmd
      .showFile(resourceName(resourceNameStr), fileName)
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' is not a folder resource`,
        ),
      );
  });

  it('showFile - file does not exist in resource', async () => {
    const resourceNameStr = 'decision/reports/anotherReport';
    const fileName = 'nonExistentFile.txt';
    await showCmd
      .showFile(resourceName(resourceNameStr), fileName)
      .catch((error) => {
        expect(error.code).to.equal('ENOENT');
      });
  });

  it('showFileNames (success)', async () => {
    const resourceNameStr = 'decision/reports/anotherReport';
    const result = await showCmd.showFileNames(resourceName(resourceNameStr));
    expect(result).to.not.equal(undefined);
    expect(result).to.be.an('array');
    expect(result).to.include('index.adoc.hbs');
    expect(result).to.include('parameterSchema.json');
    expect(result).to.include('query.lp.hbs');
    expect(result.length).to.equal(3);
  });

  it('showFileNames - resource does not exist', async () => {
    const resourceNameStr = 'decision/reports/nonExistentReport';
    await showCmd
      .showFileNames(resourceName(resourceNameStr))
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' does not exist in the project`,
        ),
      );
  });

  it('showFileNames - resource is not a folder resource', async () => {
    const resourceNameStr = 'decision/cardTypes/decision';
    await showCmd
      .showFileNames(resourceName(resourceNameStr))
      .catch((error) =>
        expect(errorFunction(error)).to.equal(
          `Resource '${resourceNameStr}' is not a folder resource`,
        ),
      );
  });

  it('showFileNames - empty folder resource', async () => {
    const resourceNameStr = 'decision/templates/empty';
    const result = await showCmd.showFileNames(resourceName(resourceNameStr));
    expect(result).to.not.equal(undefined);
    expect(result).to.be.an('array');
    expect(result.length).to.equal(0);
  });
});
