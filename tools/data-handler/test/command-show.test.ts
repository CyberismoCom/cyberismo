// testing
import { expect, it, describe, beforeEach, afterEach } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { type Workspace } from '../src/workspace/workspace.js';
import { copyDir } from '../src/utils/file-utils.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { getTestBaseDir, getTestProject } from './helpers/test-utils.js';
import { Cards } from '../src/cards/cards.js';
import { SYSTEM_ACTOR } from '../src/utils/tx-record.js';
import { CardNotFoundError } from '../src/exceptions/index.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

// validation tests do not modify the content - so they can use the original files
const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
const testDir = join(baseDir, 'tmp-command-handler-show-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');

describe('shows command', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('show command', () => {
    it('show attachment file', async () => {
      const checkout = getTestProject(decisionRecordsPath);
      await checkout.populateCaches();
      const result = await new Cards(
        checkout,
        SYSTEM_ACTOR,
        undefined,
      ).attachment('decision_1', 'the-needle.heic');
      expect(result).not.toBe(null);
      expect(result.fileBuffer).not.toBe(null);
      expect(result.mimeType).toBe('image/heic');
    });
    it('show attachment file, card not found', async () => {
      const checkout = getTestProject(decisionRecordsPath);
      await checkout.populateCaches();
      await expect(
        new Cards(checkout, SYSTEM_ACTOR, undefined).attachment(
          'invalid_key',
          'does-not-exist.png',
        ),
      ).rejects.toThrow(CardNotFoundError);
    });
    it('show attachment file, file not found', async () => {
      const checkout = getTestProject(decisionRecordsPath);
      await checkout.populateCaches();
      await expect(
        new Cards(checkout, SYSTEM_ACTOR, undefined).attachment(
          'decision_1',
          'does-not-exist.png',
        ),
      ).rejects.toThrow(
        `Attachment 'does-not-exist.png' not found for card decision_1`,
      );
    });
    // @todo add test cases for error situations
  });
});

describe('show', () => {
  const baseDir = getTestBaseDir(import.meta.dirname, import.meta.url);
  const testDir = join(baseDir, 'tmp-show-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ws = await openTestWorkspace(decisionRecordsPath, {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('showAttachments (success)', async () => {
    const results = await ws.cards.attachments();
    expect(results).not.toBeUndefined();
  });
  it('showAttachment (success)', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'the-needle.heic';
    const results = await ws.cards.attachment(cardId, attachmentName);
    expect(results).not.toBeUndefined();
  });
  it('showAttachment - empty card key', async () => {
    const cardId = '';
    const attachmentName = 'the-needle.heic';
    await expect(ws.cards.attachment(cardId, attachmentName)).rejects.toThrow(
      `Mandatory parameter 'cardKey' missing`,
    );
  });
  it('showAttachment - card does not have particular attachment', async () => {
    const cardId = 'decision_1';
    const attachmentName = 'i-dont-exist';
    await expect(ws.cards.attachment(cardId, attachmentName)).rejects.toThrow(
      `Attachment 'i-dont-exist' not found for card decision_1`,
    );
  });
  it('showCardDetails (success)', async () => {
    const cardId = 'decision_1';
    const result = await ws.cards.details(cardId);
    expect(result.key).toBe('decision_1');
  });
  it('showCardDetails - empty card key', async () => {
    const cardId = '';
    await expect(ws.cards.details(cardId)).rejects.toThrow(
      `Mandatory parameter 'cardKey' missing`,
    );
  });
  it('showCardDetails - card not in project', async () => {
    const cardId = 'decision_999';
    await expect(ws.cards.details(cardId)).rejects.toThrow(CardNotFoundError);
  });
  it('showCardDetails - empty attachment folder', async () => {
    // Use existing cards from test data
    // decision_1 (template) has the-needle.heic, decision_2 (template) has no attachments
    // decision_5 (project) has games.jpg, decision_6 (project child) has no attachments
    const cardWithNoAttachments = 'decision_2'; // template card with no attachments
    const cardWithAttachments = 'decision_1'; // template card with attachment

    // Test card with no attachments
    const noAttachmentResult = await ws.cards.details(cardWithNoAttachments);
    expect(noAttachmentResult.attachments.length).toBe(0);

    // Test card with attachments
    const withAttachmentResult = await ws.cards.details(cardWithAttachments);
    expect(withAttachmentResult.attachments.length).toBeGreaterThan(0);
    const firstAttachment = withAttachmentResult.attachments.at(0);
    expect(firstAttachment!.card).toBe(cardWithAttachments);
  });
  it('showCards (success)', async () => {
    const results = await ws.cards.list();
    expect(results).not.toBeUndefined();
  });
  it('showProjectCards (success)', async () => {
    const results = await ws.cards.roots();
    expect(results).not.toBeUndefined();
  });
  it('showResource - card type (success)', async () => {
    const cardType = 'decision/cardTypes/decision';
    const results = await ws.resources.show(cardType);
    expect(results).not.toBeUndefined();
  });
  it('showResource - empty cardType', async () => {
    const cardType = '';

    await expect(ws.resources.show(cardType)).rejects.toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('showResource - card type does not exist in project', async () => {
    const cardType = 'decision/cardTypes/my-card-type';

    await expect(ws.resources.show(cardType)).rejects.toThrow(
      `CardType '${cardType}' does not exist in the project`,
    );
  });
  it('showResource - field type (success)', async () => {
    const fieldTypeName = 'decision/fieldTypes/obsoletedBy';
    const results = await ws.resources.show(fieldTypeName);
    expect(results).not.toBeUndefined();
  });
  it('showResource - field type does not exist', async () => {
    const fieldTypeName = 'decision/fieldTypes/i-do-not-exist';

    await expect(ws.resources.show(fieldTypeName)).rejects.toThrow(
      `FieldType '${fieldTypeName}' does not exist in the project`,
    );
  });
  it('showResource - link type (success)', async () => {
    const fieldTypeName = 'decision/linkTypes/test';
    const results = await ws.resources.show(fieldTypeName);
    expect(results).not.toBeUndefined();
  });
  it('try showResource - link type does not exist', async () => {
    const linkTypeName = 'decision/linkTypes/i-do-not-exist';

    await expect(ws.resources.show(linkTypeName)).rejects.toThrow(
      `LinkType '${linkTypeName}' does not exist in the project`,
    );
  });
  it('modules show - no module name defined', async () => {
    const moduleName = '';

    await expect(ws.modules.show(moduleName)).rejects.toThrow(
      `Module '' does not exist in the project`,
    );
  });
  it('modules list (success)', async () => {
    const results = await ws.modules.list();
    expect(results).not.toBeUndefined();
  });
  it('showProject (success)', async () => {
    const results = await ws.settings.info();
    expect(results).not.toBeUndefined();
    expect(results).to.have.property('name');
    expect(results).to.have.property('path');
    expect(results).to.have.property('prefix');
    expect(results).to.have.property('modules');
    expect(results).to.have.property('hubs');
    expect(results).to.have.property('description');
    expect(results).to.have.property('category');
    const containers = await ws.cards.list();
    expect(results.numberOfCards).to.equal(
      containers.find((container) => container.type === 'project')!.cards
        .length,
    );
  });
  it('showResource - template (success)', async () => {
    const templateName = 'decision/templates/decision';
    const results = await ws.resources.show(templateName);
    expect(results).not.toBeUndefined();
  });
  it('showResource - template with no name', async () => {
    const templateName = '';

    await expect(ws.resources.show(templateName)).rejects.toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('showResource - template does not exist in project', async () => {
    const templateName = 'decision/templates/i-do-not-exist';
    await expect(ws.resources.show(templateName)).rejects.toThrow(
      `Template '${templateName}' does not exist in the project`,
    );
  });
  it('showResource - workflow (success)', async () => {
    const workflowName = 'decision/workflows/decision';
    const results = await ws.resources.show(workflowName);
    expect(results).not.toBeUndefined();
  });
  it('showResource - workflow expect type(success)', async () => {
    const workflowName = 'decision/workflows/decision';
    const results = await ws.resources.show(workflowName, 'workflows');
    expect(results).not.toBeUndefined();
  });
  it('showResource - reject non-expected resource types', async () => {
    const workflowName = 'decision/workflows/decision';
    await expect(ws.resources.show(workflowName, 'cardTypes')).rejects.toThrow(
      `While fetching 'decision/workflows/decision': Expected type 'cardTypes', but got 'workflows' instead`,
    );
  });
  it('showResource - empty workflow name', async () => {
    const workflowName = '';
    await expect(ws.resources.show(workflowName)).rejects.toThrow(
      `Must define resource name to query its details`,
    );
  });
  it('showResource - workflow does not exist in project', async () => {
    const workflowName = 'decision/workflows/i-do-not-exist';
    await expect(ws.resources.show(workflowName)).rejects.toThrow(
      `Workflow '${workflowName}' does not exist in the project`,
    );
  });
  it('should show existing resources without category', async () => {
    const cardType = 'decision/cardTypes/decision';
    const ctResults = await ws.resources.show(cardType);
    expect(ctResults).not.toBeUndefined();
    expect(ctResults.category).toBe(undefined);

    const fieldTypeName = 'decision/fieldTypes/obsoletedBy';
    const ftResults = await ws.resources.show(fieldTypeName);
    expect(ftResults).not.toBeUndefined();
    expect(ftResults.category).toBe(undefined);

    const linkTypeName = 'decision/linkTypes/test';
    const ltResults = await ws.resources.show(linkTypeName);
    expect(ltResults).not.toBeUndefined();
    expect(ltResults.category).toBe(undefined);

    // Test data for template has category... skipped!

    const workflowName = 'decision/workflows/decision';
    const wfResults = await ws.resources.show(workflowName);
    expect(wfResults).not.toBeUndefined();
    expect(wfResults.category).toBe(undefined);

    const reportName = 'decision/reports/testReport';
    const reportResults = await ws.resources.show(reportName);
    expect(reportResults).not.toBeUndefined();
    expect(reportResults.category).toBe(undefined);
  });
  it('show report results', async () => {
    const parameters = {
      name: 'decision/reports/anotherReport',
      parameters: {
        cardKey: 'decision_5',
      },
    };
    await ws.checkout.calculationEngine.generate();
    const results = await ws.queries.runReport(
      parameters.name,
      parameters.parameters,
      'localApp',
    );
    expect(results).not.toBeUndefined();
    expect(results).to.include('xref');
  });
  it('try show report results - report does not exist', async () => {
    const parameters = {
      name: 'decision/reports/wrongReport',
      parameters: {
        wrongKey: 'blaah',
      },
    };
    await ws.checkout.calculationEngine.generate();
    await expect(
      ws.queries.runReport(parameters.name, { cardKey: 'wrong' }, 'localApp'),
    ).rejects.toThrow(`Report 'decision/reports/wrongReport' does not exist`);
  });

  it('show content template (success)', async () => {
    // TODO: should be moved to resource tests
    const name = 'decision/reports/anotherReport';
    const result = await ws.checkout.resources.byType(name, 'reports').show();
    expect(result).not.toBeUndefined();
    const content = result.content.contentTemplate;
    expect(content).not.toBeUndefined();
    expect(content).to.be.a('string');
    expect(content.length).toBeGreaterThan(0);
  });

  it('showCardLogicProgram (success)', async () => {
    const cardKey = 'decision_1';
    const result = await ws.cards.logicProgram(cardKey);
    expect(result).not.toBeUndefined();
    expect(result).to.be.a('string');
  });

  it('showCardLogicProgram - card does not exist', async () => {
    const cardKey = 'nonexistent_card';

    await expect(ws.cards.logicProgram(cardKey)).rejects.toThrow(
      `Card 'nonexistent_card' does not exist in the project`,
    );
  });

  it('showLogicProgram (success)', async () => {
    const resourceNameStr = 'decision/cardTypes/decision';
    const result = await ws.queries.logicProgram(resourceName(resourceNameStr));
    expect(result).not.toBeUndefined();
    expect(result).to.be.a('string');
  });

  it('showLogicProgram - resource does not exist', async () => {
    const resourceNameStr = 'decision/cardTypes/nonexistent';

    await expect(
      ws.queries.logicProgram(resourceName(resourceNameStr)),
    ).rejects.toThrow(
      `Resource 'decision/cardTypes/nonexistent' does not exist in the project`,
    );
  });

  it('showAllTemplateCards shall provide a hierarchical array', async () => {
    const results = await ws.cards.templateCards();
    expect(results).not.toBeUndefined();
    expect(results.length).toBeGreaterThan(0);

    const templateWithCards = results.find((t) => t.cards.length > 0);
    if (templateWithCards && templateWithCards.cards.length > 0) {
      const verifyCardStructure = (
        card: { key: string; childrenCards?: unknown[] },
        depth: number = 0,
      ) => {
        expect(card).to.have.property('key');
        expect(card).to.have.property('childrenCards');
        expect(Array.isArray(card.childrenCards)).toBe(true);

        if (card.childrenCards && card.childrenCards.length > 0) {
          card.childrenCards.forEach((child) => {
            verifyCardStructure(
              child as { key: string; childrenCards?: unknown[] },
              depth + 1,
            );
          });
        }
      };

      templateWithCards.cards.forEach((card) => {
        verifyCardStructure(card);
      });
    }
  });
});
