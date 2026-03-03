import { expect } from 'chai';

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
import { ProjectPaths } from '../src/containers/project/project-paths.js';
import { getTestProject } from './helpers/test-utils.js';

describe('project', () => {
  // Create test artifacts in a temp folder.
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-project-tests');

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('create class - paths to resources (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const version = project.configuration.latestVersion;
    const calculationFolder = project.paths.resourceFolderFor(
      version,
      'calculations',
    );
    const tempCalculationFolder = project.paths.calculationFolder;
    const cardRootFolder = project.paths.cardRootFolder;
    const cardTypesFolder = project.paths.resourceFolderFor(
      version,
      'cardTypes',
    );
    const graphModelsFolder = project.paths.resourceFolderFor(
      version,
      'graphModels',
    );
    const graphViewsFolder = project.paths.resourceFolderFor(
      version,
      'graphViews',
    );
    const templatesFolder = project.paths.resourceFolderFor(
      version,
      'templates',
    );
    const workflowsFolder = project.paths.resourceFolderFor(
      version,
      'workflows',
    );
    const resourcesFolder = project.paths.versionedResourcesFolderFor(version);
    const modulesFolder = project.paths.modulesFolder;

    expect(calculationFolder).to.include('calculations');
    expect(tempCalculationFolder).to.include('.calc');
    expect(cardRootFolder).to.include('cardRoot');
    expect(graphModelsFolder).to.include('graphModels');
    expect(graphViewsFolder).to.include('graphViews');
    expect(cardTypesFolder).to.include('cardTypes');
    expect(templatesFolder).to.include('templates');
    expect(workflowsFolder).to.include('workflows');
    expect(resourcesFolder).to.include('local');
    expect(modulesFolder).to.include('modules');
  });

  it('create class - resources (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const attachments = project.attachments();
    expect(attachments.length).to.equal(1);
    const cards = project.cards();
    expect(cards.length).to.equal(2);
    const cardTypes = project.resources
      .resourceTypes('cardTypes')
      .map((item) => item.data?.name);
    expect(cardTypes.length).to.equal(2);
    const cardType1 = await project.resources
      .byType(cardTypes.at(0)!, 'cardTypes')
      .show();
    const cardType2 = await project.resources
      .byType(cardTypes.at(1)!, 'cardTypes')
      .show();
    expect(cardType1).to.not.equal(undefined);
    expect(cardType2).to.not.equal(undefined);
    const templates = project.resources.templates();
    expect(templates.length).to.equal(3);
    if (templates) {
      for (const template of templates) {
        if (template.data) {
          expect(project.resources.exists(template.data.name)).to.equal(true);
          const fetchTemplate = await project.resources
            .byType(template.data.name, 'templates')
            .show();
          expect(fetchTemplate?.name).to.equal(template.data.name);
        }
      }
    }
    expect(project.resources.exists('idontexist')).to.equal(false);

    const workflows = project.resources.workflows();
    expect(workflows.length).to.equal(2);
  });

  it('create class - show details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const projectDetails = await project.show();
    expect(projectDetails.name).to.equal(project.projectName);
    expect(projectDetails.prefix).to.equal(project.projectPrefix);
    expect(projectDetails.path).to.equal(
      resolve(project.paths.cardRootFolder, '..'),
    );
    expect(projectDetails.numberOfCards).to.equal(2);
  });

  it('create class - card operation (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const cardToOperateOn = 'decision_5';
    const templateCard = 'decision_1';
    const cardExists = project.hasCard(cardToOperateOn);
    expect(cardExists).to.equal(true);

    const name = 'decision/templates/decision';
    const templateObject = project.resources
      .byType(name, 'templates')
      .templateObject();
    if (templateObject) {
      const exists = templateObject.hasTemplateCard(templateCard);
      expect(exists).to.equal(true);
    }
    const pathToCard = await project.cardFolder(cardToOperateOn);
    expect(pathToCard).to.include('decision_5');
  });

  // Card and resource details.
  it('access card details by id (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const cardToOperateOn = 'decision_5';
    const cardExists = project.hasCard(cardToOperateOn);
    expect(cardExists).to.equal(true);

    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);
    if (card) {
      expect(card.metadata?.title).to.equal('Decision Records');
      expect(card.metadata?.cardType).to.equal('decision/cardTypes/simplepage');
      expect(card.metadata?.workflowState).to.equal('Created');
    }
    const details = {
      contentType: 'adoc' as FileContentType,
      content: true,
      metadata: true,
      children: true,
      parent: true,
      attachments: true,
    };
    const additionalCardDetails = project.findCard(cardToOperateOn, details);
    expect(additionalCardDetails).to.not.equal(undefined);
    if (additionalCardDetails) {
      expect(additionalCardDetails.metadata?.title).to.equal(
        'Decision Records',
      );
      expect(additionalCardDetails.metadata?.cardType).to.equal(
        'decision/cardTypes/simplepage',
      );
      expect(additionalCardDetails.metadata?.workflowState).to.equal('Created');
      expect(
        additionalCardDetails.children?.find((item) => item === 'decision_6'),
      ).to.not.equal(undefined);
      expect(additionalCardDetails.parent).to.equal('root');
      expect(additionalCardDetails.content).to.not.equal(undefined);
    }

    const cardFolder = await project.cardFolder(cardToOperateOn);
    expect(basename(cardFolder)).to.equal(cardToOperateOn);
  });
  it('try to find empty card from Project', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);
    expect(() => {
      project.findCard('');
    }).to.throw("Card '' does not exist in the project");
  });
  it('try to access card details with invalid card id', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);
    expect(() => {
      project.findCard('decision_999');
    }).to.throw(`Card 'decision_999' does not exist in the project`);
  });
  it('access card type details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const name = 'decision/cardTypes/simplepage';
    const cardTypeDetails = await project.resources
      .byType(name, 'cardTypes')
      .show();
    expect(cardTypeDetails).to.not.equal(undefined);
    if (cardTypeDetails) {
      expect(cardTypeDetails.workflow).to.equal('decision/workflows/simple');
    }
  });
  it('try to access card type details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const cardTypeDetails = project.resources.byType(
      'i-dont-exist',
      'cardTypes',
    ).data;
    expect(cardTypeDetails).to.equal(undefined);
  });
  it('update card metadata using key only (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousTitle = card?.metadata?.title;
      const previouslyUpdated = card?.metadata?.lastUpdated;
      const newTitle = 'TheTitle';
      await project.updateCardMetadataKey(card?.key, 'title', newTitle);
      const updatedCard = project.findCard(cardToOperateOn);

      // Expect that title is updated, and lastUpdated has been updated.
      expect(previousTitle).to.not.equal(updatedCard?.metadata?.title);
      expect(previouslyUpdated).to.not.equal(
        updatedCard?.metadata?.lastUpdated,
      );
      expect(updatedCard?.metadata?.title).to.equal(newTitle);
      // Change the title back
      await project.updateCardMetadataKey(card?.key, 'title', previousTitle);
    }
  });
  it('update card metadata using full metadata (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousTitle = card?.metadata?.title;
      const previouslyUpdated = card?.metadata?.lastUpdated;
      const newTitle = 'TheTitle';
      const newMetaData = structuredClone(card?.metadata);
      if (newMetaData) {
        newMetaData.title = 'TheTitle';
        await project.updateCardMetadata(card, newMetaData);
      }
      const updatedCard = project.findCard(cardToOperateOn);

      // Expect that title is updated, and lastUpdated has been updated.
      expect(previousTitle).to.not.equal(updatedCard?.metadata?.title);
      expect(previouslyUpdated).to.not.equal(
        updatedCard?.metadata?.lastUpdated,
      );
      expect(updatedCard?.metadata?.title).to.equal(newTitle);
      // Change the title back
      await project.updateCardMetadataKey(card?.key, 'title', previousTitle);
    }
  });
  it('try to update card metadata with same content again', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousTitle = card?.metadata?.title;
      const previouslyUpdated = card?.metadata?.lastUpdated;
      const newTitle = 'Decision Records';
      await project.updateCardMetadataKey(card?.key, 'title', newTitle);
      const updatedCard = project.findCard(cardToOperateOn);

      // Expect the data be unchanged
      expect(previousTitle).to.equal(updatedCard?.metadata?.title);
      expect(previouslyUpdated).to.equal(updatedCard?.metadata?.lastUpdated);
      expect(updatedCard?.metadata?.title).to.equal(newTitle);
    }
  });
  it('try to update card with invalid metadata', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);

    if (card) {
      // Trying to update wrong kind of data throws
      await project
        .updateCardMetadataKey(card?.key, 'workflowState', 'wrong-name')
        .then(() => expect(false))
        .catch(() => expect(true));
    }
  });
  it('metadata should not contain Card-level fields after save', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);

    if (card && card.metadata) {
      const originalTitle = card.metadata.title;
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
      expect(savedMetadata).to.not.have.property('parent');
      expect(savedMetadata).to.not.have.property('key');
      expect(savedMetadata).to.not.have.property('path');
      expect(savedMetadata).to.not.have.property('children');
      expect(savedMetadata).to.not.have.property('location');
      expect(savedMetadata).to.not.have.property('attachments');
      expect(savedMetadata).to.not.have.property('calculations');
      expect(savedMetadata).to.not.have.property('content');

      // Verify that metadata is correct
      expect(savedMetadata).to.have.property('title');
      expect(savedMetadata.title).to.equal(newTitle);
      expect(savedMetadata).to.have.property('cardType');
      expect(savedMetadata).to.have.property('workflowState');
      expect(savedMetadata).to.have.property('rank');
      expect(savedMetadata).to.have.property('links');

      // Restore original title to avoid impacting other tests
      await project.updateCardMetadataKey(card.key, 'title', originalTitle);
    }
  });
  it('update card content (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousContent = card.content;
      card.content += '\naddition';
      await project.updateCardContent(card.key, card.content!);
      expect(card.content).not.to.equal(previousContent);
    }
  });
  it('update card content and validate (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const card = project.findCard(cardToOperateOn);
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousContent = card.content;
      card.content += '\naddition';
      await project.updateCardContent(card.key, card.content!);
      expect(card.content).not.to.equal(previousContent);
    }
  });

  it('show all project cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const projectCards = project.showProjectCards();
    expect(projectCards.length).to.equal(1);
    if (projectCards.length > 0) {
      const projectCard = projectCards.at(0);
      if (projectCard) {
        expect(projectCard.key).to.equal('decision_5');
        expect(projectCard.path).to.not.equal(undefined);
        expect(projectCard.children).to.not.equal(undefined);
        expect(projectCard.metadata).to.not.equal(undefined);
        expect(projectCard.metadata?.title).to.equal('Decision Records');
        expect(projectCard.metadata?.workflowState).to.equal('Created');
        expect(isTemplateCard(projectCard)).to.equal(false);
        expect(project.hasTemplateCard(projectCard.key)).to.equal(false);
      }
    }
  });
  it('empty project does not have cards', async () => {
    const emptyProjectPath = join(testDir, 'valid/minimal');
    const project = getTestProject(emptyProjectPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const projectCards = project.showProjectCards();
    expect(projectCards.length).to.equal(0);
  });
  it('show project metadata includes category and description', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const projectMetadata = await project.show();
    expect(projectMetadata).to.not.equal(undefined);
    expect(projectMetadata).to.have.property('name');
    expect(projectMetadata).to.have.property('path');
    expect(projectMetadata).to.have.property('prefix');
    expect(projectMetadata).to.have.property('modules');
    expect(projectMetadata).to.have.property('hubs');
    expect(projectMetadata).to.have.property('numberOfCards');
    expect(projectMetadata).to.have.property('category');
    expect(projectMetadata).to.have.property('description');
  });
  it('access workflow details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const name = 'decision/workflows/simple';
    const workflowDetails = await project.resources
      .byType(name, 'workflows')
      .show();
    expect(workflowDetails).to.not.equal(undefined);
    if (workflowDetails) {
      expect(workflowDetails.states.length).to.equal(3);
      expect(workflowDetails.transitions.length).to.equal(3);
    }
  });
  it('try to access workflow details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const workflowDetails = project.resources.byType(
      'i-dont-exist',
      'workflows',
    ).data;
    expect(workflowDetails).to.equal(undefined);
  });
  it('change card state (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const cardToOperateOn = 'decision_5';
    const state = 'Approved';
    const cardDetails = project.findCard(cardToOperateOn);
    expect(cardDetails).to.not.equal(undefined);
    expect(cardDetails?.metadata?.workflowState).not.to.equal(state);

    const name = 'decision/workflows/simple';
    const workflowDetails = await project.resources
      .byType(name, 'workflows')
      .show();
    expect(workflowDetails).to.not.equal(undefined);
    const found = workflowDetails?.states.find((item) => item.name === state);
    expect(found).to.not.equal(undefined);
  });
  it('create template object from project (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);
    const template = project.resources
      .byType('decision/templates/decision', 'templates')
      .templateObject();
    expect(template).to.not.equal(undefined);
  });
  it('create template object from project using card (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);
    const templateCards = project.allTemplateCards();
    expect(templateCards.length).to.be.greaterThan(0);
    if (templateCards && templateCards.at(0)) {
      const template = project.createTemplateObjectFromCard(
        templateCards.at(0)!,
      );
      expect(template).to.not.equal(undefined);
    }
  });
  it('find certain card from project - content as adoc (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);
    const existingCard = project.findCard('decision_5', {
      content: true,
      contentType: 'adoc',
    });
    expect(existingCard).to.not.equal(undefined);
  });
  it('find certain card from project - content as html (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    expect(() => {
      project.findCard('idontexist');
    }).to.throw(`Card 'idontexist' does not exist in the project`);

    const existingCard = project.findCard('decision_5', {
      content: true,
      contentType: 'html',
    });
    expect(existingCard).to.not.equal(undefined);
  });
  it('find certain card from project - card is from template (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);
    const existingCard = project.findCard('decision_1', {
      content: true,
    });
    expect(existingCard).to.not.equal(undefined);
  });
  it('check if project is created (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);
    expect(Project.isCreated(decisionRecordsPath)).to.equal(true);
    expect(Project.isCreated('idontexist')).to.equal(false);
    expect(Project.isCreated('')).to.equal(false);
  });
  it('fetch template cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    // You get the same cards if you fetch all template cards in one call...
    let templateCards = project.allTemplateCards();
    expect(templateCards.length).to.be.greaterThan(0);
    // ...or fetch all templates, and then all cards for that template.
    const templates = project.resources.templates();
    for (const template of templates) {
      if (template.data) {
        const cards = project.templateCards(template.data.name);
        templateCards = templateCards.filter((item) => cards.includes(item));
      }
    }
    expect(templateCards.length).to.equal(0);
  });
  it('list project cards (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const allProjectCards = await project.listCards(CardLocation.projectOnly);
    const allCards = await project.listCards();
    expect(allProjectCards).to.not.equal(undefined);
    expect(allCards).to.not.equal(undefined);
    expect(allProjectCards.length).to.be.lessThan(allCards.length);
    expect(allCards[0].type).to.equal('project');
    expect(allCards[0].cards.length).to.equal(2);
    expect(allCards[1].type).to.equal('template');
    expect(allCards[1].cards.length).to.equal(1);
  });
  it('list project cards IDs (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const allTemplateCards = await project.listCardIds(
      CardLocation.templatesOnly,
    );
    const allCards = await project.listCardIds();
    expect(allTemplateCards).to.not.equal(undefined);
    expect(allCards).to.not.equal(undefined);
    expect(allTemplateCards.size).to.be.lessThan(allCards.size);
  });
  it('check all attachments', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const attachmentFolder = project.cardAttachmentFolder('decision_1');
    expect(attachmentFolder).to.include('decision_1');
    expect(attachmentFolder).to.include(`${sep}a`);

    const projectAttachments = project.attachments();
    expect(projectAttachments.length).to.equal(1);
  });
  it('check all modules', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const modules = project.resources.moduleNames();
    expect(modules.length).to.equal(0);
  });
  it('parse card path - project root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_5';
    const card = project.findCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = cardPathParts(
        project.projectPrefix,
        card.path,
      );
      expect(prefix).to.equal('decision');
      expect(cardKey).to.equal(cardId);
      expect(template).to.equal(''); // not a template card
      expect(parents.length).to.equal(0); // no parents; root card
    } else {
      expect(false);
    }
  });
  it('parse card path - project non-root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_6';
    const card = project.findCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = cardPathParts(
        project.projectPrefix,
        card.path,
      );
      expect(prefix).to.equal('decision');
      expect(cardKey).to.equal(cardId);
      expect(template).to.equal(''); // not a template card
      expect(parents.length).to.equal(1);
    } else {
      expect(false);
    }
  });
  it('parse card path - template root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_1';
    const card = project.findCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = cardPathParts(
        project.projectPrefix,
        card.path,
      );
      expect(prefix).to.equal('decision');
      expect(cardKey).to.equal(cardId);
      expect(template).to.equal('decision/templates/decision');
      expect(parents.length).to.equal(0); // no parents; root card
    } else {
      expect(false);
    }
  });
  it('parse card path - template non-root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardId = 'decision_4';
    const card = project.findCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = cardPathParts(
        project.projectPrefix,
        card.path,
      );
      expect(prefix).to.equal('decision');
      expect(cardKey).to.equal(cardId);
      expect(template).to.equal('decision/templates/simplepage');
      expect(parents.length).to.equal(1);
    } else {
      expect(false);
    }
  });
  /*
  todo: put this kind of test to where module import is possible to do.
  it('parse card path - module template card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    const { template, cardKey, prefix, parents } =
       cardPathParts(project.projectPrefix, 'decision_1');
    expect(prefix).to.equal('decision');
    expect(cardKey).to.equal('decision_1');
    expect(template).to.equal('decision');
    expect(parents).to.equal([]); // no parents; root card
  });
  */
  it('parse card path - invalid card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(() =>
      cardPathParts(project.projectPrefix, 'decision_99'),
    ).to.throw();
  });
  it('add module to project', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    expect(project).to.not.equal(undefined);

    const configFile = join(
      decisionRecordsPath,
      '.cards',
      'local',
      Project.projectConfigFileName,
    );
    const projectSettings = new ProjectConfiguration(
      configFile,
      false,
      new ProjectPaths(decisionRecordsPath),
    );
    expect(projectSettings).to.not.equal(undefined);
    expect(projectSettings.modules.length).to.equal(0);

    // Add module
    await projectSettings
      .addModule({
        name: 'mini',
        location: `file:../valid/minimal`,
      })
      .then(() => expect(projectSettings.modules.length).to.equal(1))
      .catch(() => expect(true).to.equal(false));

    // try to add the same module again
    await projectSettings
      .addModule({
        name: 'mini',
        location: `file:../valid/minimal`,
      })
      .then(() => expect(true).to.equal(false))
      .catch(() => expect(projectSettings.modules.length).to.equal(1));

    // Remove module
    await projectSettings
      .removeModule('mini')
      .then(() => expect(projectSettings.modules.length).to.equal(0))
      .catch(() => expect(true).to.equal(false));

    // try to remove the same module again
    await projectSettings
      .removeModule('mini')
      .then(() => expect(true).to.equal(false))
      .catch(() => expect(projectSettings.modules.length).to.equal(0));
  });

  it('should flatten project cards', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cards = project.cards();
    const hierarchicalCards = buildCardHierarchy(cards);
    const flat = flattenCardArray(hierarchicalCards, project);

    expect(flat.length).to.equal(2);
    const rootCard = flat.at(0);
    const childCard = flat.at(1);
    expect(rootCard?.key).to.equal('decision_5');
    expect(rootCard?.path).to.include('decision_5');
    expect(rootCard?.metadata?.cardType).to.equal(
      'decision/cardTypes/simplepage',
    );
    expect(rootCard?.children.length).to.equal(1);
    expect(rootCard?.children).to.include('decision_6');
    expect(childCard?.key).to.equal('decision_6');
    expect(childCard?.path).to.include('decision_6');
    expect(childCard?.metadata?.cardType).to.equal(
      'decision/cardTypes/decision',
    );
    expect(childCard?.children.length).to.equal(0);
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
    if (card) {
      const cardAttachments = card.attachments.map((item) => item.fileName);
      expect(cardAttachments.length).to.equal(2);
      expect(cardAttachments).to.include('newAttachment.heic');
    }
    // Also check that project attachments include the new attachment
    let projectAttachments = project.attachments().map((item) => item.fileName);
    expect(projectAttachments).to.include('newAttachment.heic');

    // Verify that attachment is visible by other means as well
    projectAttachments = project
      .attachmentsByPath(project.paths.cardRootFolder)
      .map((item) => item.fileName);
    expect(projectAttachments).to.include('newAttachment.heic');

    // Remove the attachment
    await project.removeCardAttachment('decision_5', 'newAttachment.heic');
    // Verify that attachment is no longer available
    projectAttachments = project
      .attachmentsByPath(project.paths.cardRootFolder)
      .map((item) => item.fileName);
    expect(projectAttachments).to.not.include('newAttachment.heic');

    // try to remove the same attachment again; should throw
    await expect(
      project.removeCardAttachment('decision_5', 'newAttachment.heic'),
    ).to.be.rejectedWith('Attachment not found: newAttachment.heic');
  });

  it('should card cache populated', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = getTestProject(decisionRecordsPath);
    expect(project.cardsCache.hasCard('decision_5')).to.equal(false);
    await project.populateCaches();
    expect(project.cardsCache.hasCard('decision_5')).to.equal(true);
  });
  it('should have card folder', async () => {
    const decisionRecordsPath = join(testDir, 'valid', 'decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const cardFolder = await project.cardFolder('decision_5');
    expect(cardFolder).to.include(
      `decision-records${sep}cardRoot${sep}decision_5`,
    );
  });
  it('should have children cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid', 'decision-records');
    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();

    // Check that Card data can be retrieved with card keys
    const cards = project.cardKeysToCards(['decision_5', 'decision_6']);
    expect(cards.length).to.equal(2);
    expect(cards.at(0)?.key).to.equal('decision_5');
    expect(cards.at(1)?.key).to.equal('decision_6');

    // Check that children Card data can be retrieved
    const parentCard = project.findCard('decision_5');
    if (parentCard) {
      const childCards = project.childrenCards(parentCard);
      expect(childCards.length).to.equal(1);
      expect(childCards.at(0)?.key).to.equal('decision_6');
    }
  });

  // @todo: tests needed:
  // it('calculations;
  // it('configuration;
  // it('dispose;
  // it('findProjectRoot;
  // it('module;
  // it('newCardKey;
  // it('newCardKeys;
  // modules in project: prefixes, ...
  // it('handleCardChanged()', async () => { });
  // it('handleCardDeleted()', async () => { });
  // it('handleCardMoved()', async () => { });
  // it('handleNewCards()', async () => { });

  // cache
  // it('removeResource()', async () => { }); ****
});
