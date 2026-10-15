import { expect, describe, it, beforeEach, afterEach } from 'vitest';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

import { copyDir } from '../../../src/shared/utils/file-utils.js';
import { CardLocation } from '@cyberismo/model';

import { buildCardHierarchy } from '../../../src/shared/utils/card-utils.js';
import { Checkout } from '../../../src/infra/checkout/checkout.js';
import { ProjectConfiguration } from '../../../src/infra/checkout/project-settings.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { CardNotFoundError } from '../../../src/shared/exceptions/index.js';
import { updateCardMetadataKey } from '../../../src/domain/cards/update.js';
import { removeCardAttachment } from '../../../src/domain/cards/attachments.js';
import {
  allTemplateCards as readAllTemplateCards,
  cardsByKeys,
  findCard,
  flattenCardArray,
  hasCard,
  listCardIds,
  listCards,
} from '../../../src/domain/cards/read.js';

describe('project', () => {
  // Create test artifacts in a temp folder.
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-project-tests');

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('create class - paths to resources (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const calculationFolder = checkout.paths.calculationProjectFolder;
    const tempCalculationFolder = checkout.paths.calculationFolder;
    const cardRootFolder = checkout.paths.cardRootFolder;
    const cardTypesFolder = checkout.paths.cardTypesFolder;
    const graphModelsFolder = checkout.paths.graphModelsFolder;
    const graphViewsFolder = checkout.paths.graphViewsFolder;
    const templatesFolder = checkout.paths.templatesFolder;
    const workflowsFolder = checkout.paths.workflowsFolder;
    const resourcesFolder = checkout.paths.resourcesFolder;
    const modulesFolder = checkout.paths.modulesFolder;

    expect(calculationFolder).toContain('calculations');
    expect(tempCalculationFolder).toContain('.calc');
    expect(cardRootFolder).toContain('cardRoot');
    expect(graphModelsFolder).toContain('graphModels');
    expect(graphViewsFolder).toContain('graphViews');
    expect(cardTypesFolder).toContain('cardTypes');
    expect(templatesFolder).toContain('templates');
    expect(workflowsFolder).toContain('workflows');
    expect(resourcesFolder).toContain('local');
    expect(modulesFolder).toContain('modules');
  });

  it('create class - resources (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const attachments = checkout.cardTree.attachments();
    expect(attachments.length).toBe(1);
    const cards = checkout.cardTree.cards();
    expect(cards.length).toBe(2);
    const cardTypes = checkout.resources
      .resourceTypes('cardTypes')
      .map((item) => item.data?.name);
    expect(cardTypes.length).toBe(2);
    const cardType1 = checkout.resources
      .byType(cardTypes.at(0)!, 'cardTypes')
      .show();
    const cardType2 = checkout.resources
      .byType(cardTypes.at(1)!, 'cardTypes')
      .show();
    expect(cardType1).not.toBeUndefined();
    expect(cardType2).not.toBeUndefined();
    const templates = checkout.resources.templates();
    expect(templates.length).toBe(3);
    for (const template of templates) {
      const data = template.data!;
      expect(checkout.resources.exists(data.name)).toBe(true);
      const fetchTemplate = checkout.resources
        .byType(data.name, 'templates')
        .show();
      expect(fetchTemplate?.name).toBe(data.name);
    }

    expect(checkout.resources.exists('idontexist')).toBe(false);

    const workflows = checkout.resources.workflows();
    expect(workflows.length).toBe(2);
  });

  it('create class - show details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    expect(checkout.basePath).toBe(
      resolve(checkout.paths.cardRootFolder, '..'),
    );
    const [projectCards] = await listCards(checkout, CardLocation.projectOnly);
    expect(projectCards.cards.length).toBe(2);
  });

  it('create class - card operation (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const cardToOperateOn = 'decision_5';
    const templateCard = 'decision_1';
    const cardExists = hasCard(checkout, cardToOperateOn);
    expect(cardExists).toBe(true);

    const name = 'decision/templates/decision';
    const templateResource = checkout.resources.byType(name, 'templates');
    const exists = templateResource.cardTree.has(templateCard);
    expect(exists).toBe(true);
    const pathToCard = await checkout.cardFolder(cardToOperateOn);
    expect(pathToCard).toContain('decision_5');
  });

  // Card and resource details.
  it('access card details by id (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const cardToOperateOn = 'decision_5';
    const cardExists = hasCard(checkout, cardToOperateOn);
    expect(cardExists).toBe(true);

    const card = findCard(checkout, cardToOperateOn);
    expect(card).not.toBeUndefined();
    expect(card.metadata!.title).toBe('Decision Records');
    expect(card.metadata!.cardType).toBe('decision/cardTypes/simplepage');
    expect(card.metadata!.workflowState).toBe('Created');
    const additionalCardDetails = findCard(checkout, cardToOperateOn);
    expect(additionalCardDetails).not.toBeUndefined();
    expect(additionalCardDetails.metadata!.title).toBe('Decision Records');
    expect(additionalCardDetails.metadata!.cardType).toBe(
      'decision/cardTypes/simplepage',
    );
    expect(additionalCardDetails.metadata?.workflowState).toBe('Created');
    expect(
      additionalCardDetails.children?.find((item) => item === 'decision_6'),
    ).not.toBeUndefined();
    expect(additionalCardDetails.parent).toBe('root');
    expect(additionalCardDetails.content).not.toBeUndefined();

    const cardFolder = await checkout.cardFolder(cardToOperateOn);
    expect(basename(cardFolder)).toBe(cardToOperateOn);
  });
  it('try to find empty card from Project', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();
    expect(() => {
      findCard(checkout, '');
    }).toThrow(CardNotFoundError);
  });
  it('try to access card details with invalid card id', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();
    expect(() => {
      findCard(checkout, 'decision_999');
    }).toThrow(CardNotFoundError);
  });
  it('access card type details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const name = 'decision/cardTypes/simplepage';
    const cardTypeDetails = checkout.resources.byType(name, 'cardTypes').show();
    expect(cardTypeDetails).not.toBeUndefined();
    expect(cardTypeDetails.workflow).toBe('decision/workflows/simple');
  });
  it('try to access card type details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const cardTypeDetails = checkout.resources.byType(
      'i-dont-exist',
      'cardTypes',
    ).data;
    expect(cardTypeDetails).toBeUndefined();
  });
  it('metadata should not contain Card-level fields after save', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    const card = findCard(checkout, cardToOperateOn);
    expect(card).not.toBeUndefined();

    const originalTitle = card.metadata!.title;
    const newTitle = 'Test Title Change';

    // Contaminate metadata with Card properties
    const badMetadata = card.metadata as Record<string, unknown>;
    badMetadata['parent'] = 'test_parent';
    badMetadata['key'] = 'test_key';
    badMetadata['path'] = '/test/path';
    badMetadata['children'] = ['child1', 'child2'];
    badMetadata['location'] = 'test_location';
    await updateCardMetadataKey(checkout, card.key, 'title', newTitle);

    // Read the metadata file directly from disk & verify that Card properties have not been stored
    const metadataPath = join(card.path, 'index.json');
    const savedMetadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
    expect(savedMetadata).not.toHaveProperty('parent');
    expect(savedMetadata).not.toHaveProperty('key');
    expect(savedMetadata).not.toHaveProperty('path');
    expect(savedMetadata).not.toHaveProperty('children');
    expect(savedMetadata).not.toHaveProperty('location');
    expect(savedMetadata).not.toHaveProperty('attachments');
    expect(savedMetadata).not.toHaveProperty('calculations');
    expect(savedMetadata).not.toHaveProperty('content');

    // Verify that metadata is correct
    expect(savedMetadata).toHaveProperty('title');
    expect(savedMetadata.title).toBe(newTitle);
    expect(savedMetadata).toHaveProperty('cardType');
    expect(savedMetadata).toHaveProperty('workflowState');
    expect(savedMetadata).toHaveProperty('rank');
    expect(savedMetadata).toHaveProperty('links');

    // Restore original title to avoid impacting other tests
    await updateCardMetadataKey(checkout, card.key, 'title', originalTitle);
  });
  it('show all project cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const projectCards = checkout.cardTree.rootCards();
    expect(projectCards.length).toBe(1);
    const projectCard = projectCards.at(0)!;
    expect(projectCard.key).toBe('decision_5');
    expect(projectCard.path).not.toBeUndefined();
    expect(projectCard.children).not.toBeUndefined();
    expect(projectCard.metadata).not.toBeUndefined();
    expect(projectCard.metadata?.title).toBe('Decision Records');
    expect(projectCard.metadata?.workflowState).toBe('Created');
    expect(checkout.treeOf(projectCard.key)).toBe(checkout.cardTree);
  });
  it('empty project does not have cards', async () => {
    const emptyProjectPath = join(testDir, 'valid/minimal');
    const checkout = getTestProject(emptyProjectPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const projectCards = checkout.cardTree.rootCards();
    expect(projectCards.length).toBe(0);
  });
  it('access workflow details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const name = 'decision/workflows/simple';
    const workflowDetails = await checkout.resources
      .byType(name, 'workflows')
      .show();
    expect(workflowDetails).not.toBeUndefined();
    expect(workflowDetails.states.length).toBe(3);
    expect(workflowDetails.transitions.length).toBe(3);
  });
  it('try to access workflow details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const workflowDetails = checkout.resources.byType(
      'i-dont-exist',
      'workflows',
    ).data;
    expect(workflowDetails).toBe(undefined);
  });
  it('create template object from project (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();
    const template = checkout.resources.byType(
      'decision/templates/decision',
      'templates',
    );
    expect(template).not.toBeUndefined();
  });
  it('create template object from project using card (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();
    const templateCards = readAllTemplateCards(checkout);
    expect(templateCards.length).toBeGreaterThan(0);
    const treeName = checkout.treeOf(templateCards.at(0)!.key).name;
    expect(treeName).not.toBe('project');
    const template = checkout.templateResource(treeName);
    expect(template).not.toBeUndefined();
    expect(template!.fullName).toBe(treeName);
  });
  it('find certain card from project - with content (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    expect(() => {
      findCard(checkout, 'idontexist');
    }).toThrow(CardNotFoundError);

    const existingCard = findCard(checkout, 'decision_5');
    expect(existingCard).not.toBeUndefined();
    expect(existingCard.content).not.toBeUndefined();
  });
  it('find certain card from project - card is from template (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();
    const existingCard = findCard(checkout, 'decision_1');
    expect(existingCard).not.toBeUndefined();
    expect(existingCard.content).not.toBeUndefined();
  });
  it('check if project is created (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();
    expect(Checkout.isCreated(decisionRecordsPath)).toBe(true);
    expect(Checkout.isCreated('idontexist')).toBe(false);
    expect(Checkout.isCreated('')).toBe(false);
  });
  it('fetch template cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    // You get the same cards if you fetch all template cards in one call...
    let templateCards = readAllTemplateCards(checkout);
    expect(templateCards).toHaveLength(4);
    // ...or fetch all templates, and then all cards for that template.
    const templates = checkout.resources.templates();
    for (const template of templates) {
      const cards = checkout.templateTree(template.data!.name).cards();
      templateCards = templateCards.filter((item) => cards.includes(item));
    }
    expect(templateCards).toHaveLength(0);
  });
  it('no tree for a name that does not resolve to a template', async () => {
    const checkout = getTestProject(join(testDir, 'valid/decision-records'));
    expect(() => checkout.templateTree('a/b/c/d')).toThrow(
      "Template 'a/b/c/d' does not exist",
    );
  });
  it('a scoped reload drops the tree of a template that is gone', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();

    const removed = 'decision/templates/decision';
    const removedKeys = checkout.templateTree(removed).keys();
    expect(removedKeys.length).toBeGreaterThan(0);

    // The template is gone, but the reload names another template - which is
    // what a module update that dropped this one asks for.
    checkout.resources.remove(removed);
    await checkout.refreshAfterModuleChange(['decision']);

    for (const cardKey of removedKeys) {
      expect(hasCard(checkout, cardKey)).toBe(false);
    }
    expect(
      readAllTemplateCards(checkout).map((card) => card.key),
    ).not.toContain(removedKeys[0]);
  });
  it('list project cards IDs (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const allTemplateCards = await listCardIds(
      checkout,
      CardLocation.templatesOnly,
    );
    const allCards = await listCardIds(checkout);
    expect(allTemplateCards).not.toBeUndefined();
    expect(allCards).not.toBeUndefined();
    expect(allTemplateCards.size).toBeLessThan(allCards.size);
  });
  it('check all attachments', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const attachmentFolder = checkout.cardAttachmentFolder('decision_1');
    expect(attachmentFolder).toContain('decision_1');
    expect(attachmentFolder).toContain(`${sep}a`);

    const projectAttachments = checkout.cardTree.attachments();
    expect(projectAttachments.length).toBe(1);
  });
  it('check all modules', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const modules = checkout.resources.moduleNames();
    expect(modules.length).toBe(0);
  });
  it('card position - project root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    const cardId = 'decision_5';
    const card = findCard(checkout, cardId);
    expect(card.key).toBe(cardId);
    expect(card.parent).toBe('root'); // root card
    expect(checkout.treeOf(cardId).ancestorsOf(cardId)).toHaveLength(0);
    expect(checkout.treeOf(cardId).name).toBe('project'); // not a template card
    expect(card.path).toBe(join(checkout.paths.cardRootFolder, cardId));
  });
  it('card position - project non-root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    const cardId = 'decision_6';
    const card = findCard(checkout, cardId);
    expect(card.key).toBe(cardId);
    expect(checkout.treeOf(cardId).name).toBe('project'); // not a template card
    expect(checkout.treeOf(cardId).ancestorsOf(cardId)).toHaveLength(1);
    expect(card.path).toBe(
      join(checkout.paths.cardRootFolder, card.parent!, 'c', cardId),
    );
  });
  it('card position - template root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    const cardId = 'decision_1';
    const card = findCard(checkout, cardId);
    expect(card.key).toBe(cardId);
    expect(card.parent).toBe('root'); // root card
    expect(checkout.treeOf(cardId).ancestorsOf(cardId)).toHaveLength(0);
    expect(checkout.treeOf(cardId).name).toBe('decision/templates/decision');
  });
  it('card position - template non-root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    const cardId = 'decision_4';
    const card = findCard(checkout, cardId);
    expect(card.key).toBe(cardId);
    expect(checkout.treeOf(cardId).ancestorsOf(cardId)).toHaveLength(1);
    expect(checkout.treeOf(cardId).name).toBe('decision/templates/simplepage');
  });

  it('card position - invalid card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(() => findCard(checkout, 'decision_99')).toThrow();
    expect(hasCard(checkout, 'decision_99')).toBe(false);
  });
  it('add module to project', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    expect(checkout).not.toBeUndefined();

    const configFile = join(
      decisionRecordsPath,
      '.cards',
      'local',
      Checkout.projectConfigFileName,
    );
    const projectSettings = new ProjectConfiguration(configFile);
    expect(projectSettings).not.toBeUndefined();
    expect(projectSettings.modules.length).toBe(0);

    // Add module
    await projectSettings.upsertModule({
      name: 'mini',
      location: `file:../valid/minimal`,
    });
    expect(projectSettings.modules.length).toBe(1);

    // upserting the same module is idempotent (no duplicate entry)
    await projectSettings.upsertModule({
      name: 'mini',
      location: `file:../valid/minimal`,
    });
    expect(projectSettings.modules.length).toBe(1);

    // Remove module
    await projectSettings.removeModule('mini');
    expect(projectSettings.modules.length).toBe(0);
    // try to remove the same module again

    await expect(projectSettings.removeModule('mini')).rejects.toThrow();
    expect(projectSettings.modules.length).toBe(0);
  });

  it('should flatten project cards', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    const cards = checkout.cardTree.cards();
    const hierarchicalCards = buildCardHierarchy(cards);
    const flat = flattenCardArray(hierarchicalCards, checkout);

    expect(flat.length).toBe(2);
    const rootCard = flat.at(0)!;
    const childCard = flat.at(1)!;
    expect(rootCard.key).toBe('decision_5');
    expect(rootCard.path).toContain('decision_5');
    expect(rootCard.metadata?.cardType).toBe('decision/cardTypes/simplepage');
    expect(rootCard.children.length).toBe(1);
    expect(rootCard.children).toContain('decision_6');
    expect(childCard.key).toBe('decision_6');
    expect(childCard.path).toContain('decision_6');
    expect(childCard.metadata?.cardType).toBe('decision/cardTypes/decision');
    expect(childCard.children.length).toBe(0);
  });

  it('should reject path traversal via .. in removeCardAttachment', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();

    const attachmentFolder = checkout.cardAttachmentFolder('decision_5');
    const testFilePath = join(attachmentFolder, '..', 'test-file.txt');
    writeFileSync(testFilePath, 'should not be deleted');

    // Attempt to delete the test file via path traversal.
    await expect(
      removeCardAttachment(checkout, 'decision_5', '../test-file.txt'),
    ).rejects.toThrow();

    // The test file must still exist after the rejected operation.
    expect(existsSync(testFilePath)).toBe(true);
  });

  it('should card cache populated', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const checkout = getTestProject(decisionRecordsPath);
    expect(hasCard(checkout, 'decision_5')).toBe(false);
    await checkout.populateCaches();
    expect(hasCard(checkout, 'decision_5')).toBe(true);
  });
  it('should have card folder', async () => {
    const decisionRecordsPath = join(testDir, 'valid', 'decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();
    const cardFolder = await checkout.cardFolder('decision_5');
    expect(cardFolder).toContain(
      `decision-records${sep}cardRoot${sep}decision_5`,
    );
  });
  it('should have children cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid', 'decision-records');
    const checkout = getTestProject(decisionRecordsPath);
    await checkout.populateCaches();

    // Check that Card data can be retrieved with card keys
    const cards = cardsByKeys(checkout, ['decision_5', 'decision_6']);
    expect(cards.length).toBe(2);
    expect(cards.at(0)!.key).toBe('decision_5');
    expect(cards.at(1)!.key).toBe('decision_6');

    // Check that children Card data can be retrieved
    const parentCard = findCard(checkout, 'decision_5');
    const childCards = cardsByKeys(checkout, parentCard.children);
    expect(childCards.length).toBe(1);
    expect(childCards.at(0)!.key).toBe('decision_6');
  });
});
