import { expect, describe, it, beforeEach, afterEach } from 'vitest';

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import {
  CardLocation,
  type FileContentType,
} from '../src/interfaces/project-interfaces.js';

import {
  buildCardHierarchy,
  flattenCardArray,
  cardPathParts,
  isTemplateCard,
} from '../src/utils/card-utils.js';
import { Project } from '../src/containers/project.js';
import { ProjectConfiguration } from '../src/project-settings.js';
import { getTestProject } from './helpers/test-utils.js';
import { CardNotFoundError } from '../src/exceptions/index.js';

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
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const calculationFolder = project.paths.calculationProjectFolder;
    const tempCalculationFolder = project.paths.calculationFolder;
    const cardRootFolder = project.paths.cardRootFolder;
    const cardTypesFolder = project.paths.cardTypesFolder;
    const graphModelsFolder = project.paths.graphModelsFolder;
    const graphViewsFolder = project.paths.graphViewsFolder;
    const templatesFolder = project.paths.templatesFolder;
    const workflowsFolder = project.paths.workflowsFolder;
    const resourcesFolder = project.paths.resourcesFolder;
    const modulesFolder = project.paths.modulesFolder;

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
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const attachments = project.attachments();
    expect(attachments.length).toBe(1);
    const cards = project.cards();
    expect(cards.length).toBe(2);
    const cardTypes = project.resources
      .resourceTypes('cardTypes')
      .map((item) => item.data?.name);
    expect(cardTypes.length).toBe(2);
    const cardType1 = project.resources
      .byType(cardTypes.at(0)!, 'cardTypes')
      .show();
    const cardType2 = project.resources
      .byType(cardTypes.at(1)!, 'cardTypes')
      .show();
    expect(cardType1).not.toBeUndefined();
    expect(cardType2).not.toBeUndefined();
    const templates = project.resources.templates();
    expect(templates.length).toBe(3);
    for (const template of templates) {
      const data = template.data!;
      expect(project.resources.exists(data.name)).toBe(true);
      const fetchTemplate = project.resources
        .byType(data.name, 'templates')
        .show();
      expect(fetchTemplate?.name).toBe(data.name);
    }

    expect(project.resources.exists('idontexist')).toBe(false);

    const workflows = project.resources.workflows();
    expect(workflows.length).toBe(2);
  });

  it('create class - show details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const projectDetails = await project.show();
    expect(projectDetails.name).toBe(project.projectName);
    expect(projectDetails.prefix).toBe(project.projectPrefix);
    expect(projectDetails.path).toBe(
      resolve(project.paths.cardRootFolder, '..'),
    );
    expect(projectDetails.numberOfCards).toBe(2);
  });

  it('create class - card operation (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const cardToOperateOn = 'decision_5';
    const templateCard = 'decision_1';
    const cardExists = project.hasCard(cardToOperateOn);
    expect(cardExists).toBe(true);

    const name = 'decision/templates/decision';
    const templateObject = project.resources
      .byType(name, 'templates')
      .templateObject();
    const exists = templateObject.hasTemplateCard(templateCard);
    expect(exists).toBe(true);
    const pathToCard = await project.cardFolder(cardToOperateOn);
    expect(pathToCard).toContain('decision_5');
  });

  // Card and resource details.
  it('access card details by id (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const cardToOperateOn = 'decision_5';
    const cardExists = project.hasCard(cardToOperateOn);
    expect(cardExists).toBe(true);

    const card = project.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();
    expect(card.metadata!.title).toBe('Decision Records');
    expect(card.metadata!.cardType).toBe('decision/cardTypes/simplepage');
    expect(card.metadata!.workflowState).toBe('Created');
    const details = {
      contentType: 'adoc' as FileContentType,
      content: true,
      metadata: true,
      children: true,
      parent: true,
      attachments: true,
    };
    const additionalCardDetails = project.findCard(cardToOperateOn, details);
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

    const cardFolder = await project.cardFolder(cardToOperateOn);
    expect(basename(cardFolder)).toBe(cardToOperateOn);
  });
  it('try to find empty card from Project', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();
    expect(() => {
      project.findCard('');
    }).toThrow(CardNotFoundError);
  });
  it('try to access card details with invalid card id', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();
    expect(() => {
      project.findCard('decision_999');
    }).toThrow(CardNotFoundError);
  });
  it('access card type details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const name = 'decision/cardTypes/simplepage';
    const cardTypeDetails = project.resources.byType(name, 'cardTypes').show();
    expect(cardTypeDetails).not.toBeUndefined();
    expect(cardTypeDetails.workflow).toBe('decision/workflows/simple');
  });
  it('try to access card type details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const cardTypeDetails = project.resources.byType(
      'i-dont-exist',
      'cardTypes',
    ).data;
    expect(cardTypeDetails).toBeUndefined();
  });
  it('update card metadata using key only (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();

    const previousTitle = card?.metadata?.title;
    const previouslyUpdated = card?.metadata?.lastUpdated;
    const newTitle = 'TheTitle';
    await project.updateCardMetadataKey(card?.key, 'title', newTitle);
    const updatedCard = project.findCard(cardToOperateOn);

    // Expect that title is updated, and lastUpdated has been updated.
    expect(previousTitle).not.toBe(updatedCard.metadata!.title);
    expect(previouslyUpdated).not.toBe(updatedCard.metadata!.lastUpdated);
    expect(updatedCard.metadata!.title).toBe(newTitle);
    expect(updatedCard.metadata!.createdAt).toBe(card.metadata!.createdAt);
    // Change the title back
    await project.updateCardMetadataKey(card?.key, 'title', previousTitle);
  });
  it('update card metadata using full metadata (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();

    const previousTitle = card.metadata!.title;
    const previouslyUpdated = card.metadata!.lastUpdated;
    const newTitle = 'TheTitle';
    const newMetaData = structuredClone(card.metadata)!;
    newMetaData.title = 'TheTitle';
    await project.updateCardMetadata(card, newMetaData);
    const updatedCard = project.findCard(cardToOperateOn);

    // Expect that title is updated, and lastUpdated has been updated.
    expect(previousTitle).not.toBe(updatedCard.metadata!.title);
    expect(previouslyUpdated).not.toBe(updatedCard.metadata!.lastUpdated);
    expect(updatedCard.metadata!.title).toBe(newTitle);
    // Change the title back
    await project.updateCardMetadataKey(card?.key, 'title', previousTitle);
  });
  it('try to update card metadata with same content again', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();

    const previousTitle = card.metadata!.title;
    const previouslyUpdated = card.metadata!.lastUpdated;
    const newTitle = 'Decision Records';
    await project.updateCardMetadataKey(card.key, 'title', newTitle);
    const updatedCard = project.findCard(cardToOperateOn);

    // Expect the data be unchanged
    expect(previousTitle).toBe(updatedCard.metadata!.title);
    expect(previouslyUpdated).toBe(updatedCard.metadata!.lastUpdated);
    expect(updatedCard.metadata!.title).toBe(newTitle);
  });
  it('try to update card with invalid metadata', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();

    // Trying to update wrong kind of data throws
    await expect(
      project.updateCardMetadataKey(card!.key, 'workflowState', 'wrong-name'),
    ).rejects.toThrow();
  });
  it('metadata should not contain Card-level fields after save', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
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
    await project.updateCardMetadataKey(card.key, 'title', newTitle);

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
    await project.updateCardMetadataKey(card.key, 'title', originalTitle);
  });
  it('update card content (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();

    const previousContent = card.content;
    card.content += '\naddition';
    await project.updateCardContent(card.key, card.content!);
    expect(card.content).not.toBe(previousContent);
  });
  it('update card content and validate (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).not.toBeUndefined();

    const previousContent = card.content;
    card.content += '\naddition';
    await project.updateCardContent(card.key, card.content!);
    expect(card.content).not.toBe(previousContent);
  });

  it('show all project cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const projectCards = project.showProjectCards();
    expect(projectCards.length).toBe(1);
    const projectCard = projectCards.at(0)!;
    expect(projectCard.key).toBe('decision_5');
    expect(projectCard.path).not.toBeUndefined();
    expect(projectCard.children).not.toBeUndefined();
    expect(projectCard.metadata).not.toBeUndefined();
    expect(projectCard.metadata?.title).toBe('Decision Records');
    expect(projectCard.metadata?.workflowState).toBe('Created');
    expect(isTemplateCard(projectCard)).toBe(false);
    expect(project.hasTemplateCard(projectCard.key)).toBe(false);
  });
  it('empty project does not have cards', async () => {
    const emptyProjectPath = join(testDir, 'valid/minimal');
    const project = getTestProject(emptyProjectPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const projectCards = project.showProjectCards();
    expect(projectCards.length).toBe(0);
  });
  it('show project metadata includes category and description', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const projectMetadata = await project.show();
    expect(projectMetadata).not.toBeUndefined();
    expect(projectMetadata).toHaveProperty('name');
    expect(projectMetadata).toHaveProperty('path');
    expect(projectMetadata).toHaveProperty('prefix');
    expect(projectMetadata).toHaveProperty('modules');
    expect(projectMetadata).toHaveProperty('hubs');
    expect(projectMetadata).toHaveProperty('numberOfCards');
    expect(projectMetadata).toHaveProperty('category');
    expect(projectMetadata).toHaveProperty('description');
  });
  it('access workflow details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const name = 'decision/workflows/simple';
    const workflowDetails = await project.resources
      .byType(name, 'workflows')
      .show();
    expect(workflowDetails).not.toBeUndefined();
    expect(workflowDetails.states.length).toBe(3);
    expect(workflowDetails.transitions.length).toBe(3);
  });
  it('try to access workflow details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const workflowDetails = project.resources.byType(
      'i-dont-exist',
      'workflows',
    ).data;
    expect(workflowDetails).toBe(undefined);
  });
  it('change card state (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const cardToOperateOn = 'decision_5';
    const state = 'Approved';
    const cardDetails = project.findCard(cardToOperateOn);
    expect(cardDetails).not.toBeUndefined();
    expect(cardDetails.metadata!.workflowState).not.toBe(state);

    const name = 'decision/workflows/simple';
    const workflowDetails = project.resources.byType(name, 'workflows').show();
    expect(workflowDetails).not.toBeUndefined();
    const found = workflowDetails.states.find((item) => item.name === state);
    expect(found).not.toBeUndefined();
  });
  it('create template object from project (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();
    const template = project.resources
      .byType('decision/templates/decision', 'templates')
      .templateObject();
    expect(template).not.toBeUndefined();
  });
  it('create template object from project using card (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();
    const templateCards = project.allTemplateCards();
    expect(templateCards.length).toBeGreaterThan(0);
    const template = project.createTemplateObjectFromCard(templateCards.at(0)!);
    expect(template).not.toBeUndefined();
  });
  it('find certain card from project - content as adoc (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();
    const existingCard = project.findCard('decision_5', {
      content: true,
      contentType: 'adoc',
    });
    expect(existingCard).not.toBeUndefined();
  });
  it('find certain card from project - content as html (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    expect(() => {
      project.findCard('idontexist');
    }).toThrow(CardNotFoundError);

    const existingCard = project.findCard('decision_5', {
      content: true,
      contentType: 'html',
    });
    expect(existingCard).not.toBeUndefined();
  });
  it('find certain card from project - card is from template (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();
    const existingCard = project.findCard('decision_1', {
      content: true,
    });
    expect(existingCard).not.toBeUndefined();
  });
  it('check if project is created (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();
    expect(Project.isCreated(decisionRecordsPath)).toBe(true);
    expect(Project.isCreated('idontexist')).toBe(false);
    expect(Project.isCreated('')).toBe(false);
  });
  it('fetch template cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    // You get the same cards if you fetch all template cards in one call...
    let templateCards = project.allTemplateCards();
    expect(templateCards).toHaveLength(4);
    // ...or fetch all templates, and then all cards for that template.
    const templates = project.resources.templates();
    for (const template of templates) {
      const cards = project.templateCards(template.data!.name);
      templateCards = templateCards.filter((item) => cards.includes(item));
    }
    expect(templateCards).toHaveLength(0);
  });
  it('list project cards (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const allProjectCards = await project.listCards(CardLocation.projectOnly);
    const allCards = await project.listCards();
    expect(allProjectCards).not.toBeUndefined();
    expect(allCards).not.toBeUndefined();
    expect(allProjectCards.length).toBeLessThan(allCards.length);
    expect(allCards[0].type).toBe('project');
    expect(allCards[0].cards.length).toBe(2);
    expect(allCards[1].type).toBe('template');
    expect(allCards[1].cards.length).toBe(1);
  });
  it('list project cards IDs (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const allTemplateCards = await project.listCardIds(
      CardLocation.templatesOnly,
    );
    const allCards = await project.listCardIds();
    expect(allTemplateCards).not.toBeUndefined();
    expect(allCards).not.toBeUndefined();
    expect(allTemplateCards.size).toBeLessThan(allCards.size);
  });
  it('check all attachments', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const attachmentFolder = project.cardAttachmentFolder('decision_1');
    expect(attachmentFolder).toContain('decision_1');
    expect(attachmentFolder).toContain(`${sep}a`);

    const projectAttachments = project.attachments();
    expect(projectAttachments.length).toBe(1);
  });
  it('check all modules', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const modules = project.resources.moduleNames();
    expect(modules.length).toBe(0);
  });
  it('parse card path - project root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_5';
    const card = project.findCard(cardId);
    const { template, cardKey, prefix, parents } = cardPathParts(
      project.projectPrefix,
      card.path,
    );
    expect(prefix).toBe('decision');
    expect(cardKey).toBe(cardId);
    expect(template).toBe(''); // not a template card
    expect(parents.length).toBe(0); // no parents; root card
  });
  it('parse card path - project non-root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_6';
    const card = project.findCard(cardId);
    const { template, cardKey, prefix, parents } = cardPathParts(
      project.projectPrefix,
      card.path,
    );
    expect(prefix).toBe('decision');
    expect(cardKey).toBe(cardId);
    expect(template).toBe(''); // not a template card
    expect(parents.length).toBe(1);
  });
  it('parse card path - template root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_1';
    const card = project.findCard(cardId);
    const { template, cardKey, prefix, parents } = cardPathParts(
      project.projectPrefix,
      card.path,
    );
    expect(prefix).toBe('decision');
    expect(cardKey).toBe(cardId);
    expect(template).toBe('decision/templates/decision');
    expect(parents.length).toBe(0); // no parents; root card
  });
  it('parse card path - template non-root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_4';
    const card = project.findCard(cardId);
    const { template, cardKey, prefix, parents } = cardPathParts(
      project.projectPrefix,
      card.path,
    );
    expect(prefix).toBe('decision');
    expect(cardKey).toBe(cardId);
    expect(template).toBe('decision/templates/simplepage');
    expect(parents.length).toBe(1);
  });

  it('parse card path - invalid card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(() => cardPathParts(project.projectPrefix, 'decision_99')).toThrow();
  });
  it('add module to project', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).not.toBeUndefined();

    const configFile = join(
      decisionRecordsPath,
      '.cards',
      'local',
      Project.projectConfigFileName,
    );
    const projectSettings = new ProjectConfiguration(configFile, false);
    expect(projectSettings).not.toBeUndefined();
    expect(projectSettings.modules.length).toBe(0);

    // Add module
    await projectSettings.addModule({
      name: 'mini',
      location: `file:../valid/minimal`,
    });
    expect(projectSettings.modules.length).toBe(1);

    // try to add the same module again

    await expect(
      projectSettings.addModule({
        name: 'mini',
        location: `file:../valid/minimal`,
      }),
    ).rejects.toThrow();
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
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cards = project.cards();
    const hierarchicalCards = buildCardHierarchy(cards);
    const flat = flattenCardArray(hierarchicalCards, project);

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

  it('card attachments - add and remove', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    // New attachment
    const attachmentFileName = 'the-needle.heic';
    const attachmentPath = join(
      testDir,
      'attachments' + sep + attachmentFileName,
    );
    const attachment = readFileSync(attachmentPath);

    // Add attachment to a card
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    await project.createCardAttachment(
      'decision_5',
      'newAttachment.heic', // this is the file name it will use on disk
      attachment,
    );

    // Check that card includes the new attachment
    const card = project.findCard('decision_5');
    const cardAttachments = card.attachments.map((item) => item.fileName);
    expect(cardAttachments.length).toBe(2);
    expect(cardAttachments).toContain('newAttachment.heic');

    // Also check that project attachments include the new attachment
    const projectAttachments = project
      .attachments()
      .map((item) => item.fileName);
    expect(projectAttachments).toContain('newAttachment.heic');

    // Verify that attachment is visible by other means as well
    const projectAttachmentsVerified = project
      .attachmentsByPath(project.paths.cardRootFolder)
      .map((item) => item.fileName);
    expect(projectAttachmentsVerified).toContain('newAttachment.heic');

    // Remove the attachment
    await project.removeCardAttachment('decision_5', 'newAttachment.heic');
    // Verify that attachment is no longer available
    const projectAttachmentsRemoved = project
      .attachmentsByPath(project.paths.cardRootFolder)
      .map((item) => item.fileName);
    expect(projectAttachmentsRemoved).not.toContain('newAttachment.heic');

    // try to remove the same attachment again; should throw
    await expect(
      project.removeCardAttachment('decision_5', 'newAttachment.heic'),
    ).rejects.toThrow('Attachment not found: newAttachment.heic');
  });

  it('should card cache populated', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    expect(project.cardsCache.hasCard('decision_5')).toBe(false);
    await project.populateCaches();
    expect(project.cardsCache.hasCard('decision_5')).toBe(true);
  });
  it('should have card folder', async () => {
    const decisionRecordsPath = join(testDir, 'valid', 'decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardFolder = await project.cardFolder('decision_5');
    expect(cardFolder).toContain(
      `decision-records${sep}cardRoot${sep}decision_5`,
    );
  });
  it('should have children cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid', 'decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();

    // Check that Card data can be retrieved with card keys
    const cards = project.cardKeysToCards(['decision_5', 'decision_6']);
    expect(cards.length).toBe(2);
    expect(cards.at(0)!.key).toBe('decision_5');
    expect(cards.at(1)!.key).toBe('decision_6');

    // Check that children Card data can be retrieved
    const parentCard = project.findCard('decision_5');
    const childCards = project.childrenCards(parentCard);
    expect(childCards.length).toBe(1);
    expect(childCards.at(0)!.key).toBe('decision_6');
  });
});
