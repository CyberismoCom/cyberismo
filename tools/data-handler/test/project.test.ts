// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { FileContentType } from '../src/interfaces/project-interfaces.js';
import { fileURLToPath } from 'node:url';
import { Project } from '../src/containers/project.js';
import { ProjectConfiguration } from '../src/project-settings.js';
import { resourceName } from '../src/utils/resource-utils.js';

import { WorkflowResource } from '../src/resources/workflow-resource.js';
import { CardTypeResource } from '../src/resources/card-type-resource.js';
import { FieldTypeResource } from '../src/resources/field-type-resource.js';
import { LinkTypeResource } from '../src/resources/link-type-resource.js';

describe('project', () => {
  // Create test artifacts in a temp folder.
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-project-tests');

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('create class - paths to resources (success)', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardRootFolder = project.paths.cardRootFolder;
    const cardTypesFolder = project.paths.cardTypesFolder;
    const templatesFolder = project.paths.templatesFolder;
    const workflowsFolder = project.paths.workflowsFolder;
    const resourcesFolder = project.paths.resourcesFolder;
    const modulesFolder = project.paths.modulesFolder;

    expect(cardRootFolder).to.include('cardRoot');
    expect(cardTypesFolder).to.include('cardTypes');
    expect(templatesFolder).to.include('templates');
    expect(workflowsFolder).to.include('workflows');
    expect(resourcesFolder).to.include('local');
    expect(modulesFolder).to.include('modules');
  });

  it('create class - resources (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const attachments = await project.attachments();
    expect(attachments.length).to.equal(1);
    const cards = await project.cards();
    expect(cards.length).to.equal(2);
    const cardTypes = await project.cardTypes();
    expect(cardTypes.length).to.equal(2);
    const cardType1 = await project.cardType(cardTypes[0].name);
    const cardType2 = await project.cardType(cardTypes[1].name);
    expect(cardType1).to.not.equal(undefined);
    expect(cardType2).to.not.equal(undefined);
    const templates = await project.templates();
    expect(templates.length).to.equal(3);
    if (templates) {
      for (const template of templates) {
        expect(
          await project.resourceExists('template', template.name),
        ).to.equal(true);
        const fetchTemplate = await project.template(template.name);
        expect(fetchTemplate).to.equal(template);
      }
    }
    expect(await project.resourceExists('template', 'idontexist')).to.equal(
      false,
    );

    const workflows = await project.workflows();
    expect(workflows.length).to.equal(2);
    // Check workflow initial states are correct per workflow.
    if (workflows && workflows.length > 1) {
      const expectedInitialStates = ['Draft', 'Created'];
      for (const workflow of workflows) {
        if (workflow) {
          const initialState = await project.workflowInitialState(
            workflow.name,
          );
          const expectedState = expectedInitialStates.at(
            workflows.indexOf(workflow),
          );
          expect(initialState).to.equal(expectedState);

          const workflowDetails = await project.workflow(workflow.name);
          if (workflowDetails) {
            for (const states of workflowDetails.states) {
              if (expectedInitialStates.find((item) => item === states.name)) {
                expect(states.category).to.equal('initial');
              }
            }
          }
        }
      }
    }

    // Check that invalid workflow name does return correctly
    const initialState = await project.workflowInitialState('idontexist');
    expect(initialState).to.equal(undefined);
  });

  it('create class - show details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const projectDetails = await project.show();
    expect(projectDetails.name).to.equal(project.projectName);
    expect(projectDetails.prefix).to.equal(project.projectPrefix);
    expect(projectDetails.path).to.equal(
      resolve(project.paths.cardRootFolder, '..'),
    );
    expect(projectDetails.numberOfCards).to.equal(2);
  });

  it('create settings class (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const configFile = join(
      decisionRecordsPath,
      '.cards',
      'local',
      Project.projectConfigFileName,
    );
    const projectSettings = ProjectConfiguration.getInstance(configFile);
    expect(projectSettings).to.not.equal(undefined);

    const prefix = projectSettings.cardKeyPrefix;
    expect(prefix).to.equal('decision');

    const prefixes = await project.projectPrefixes();
    expect(prefixes).to.contain(prefix);
  });

  it('multiple instances of settings class', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const emptyProjectPath = join(testDir, 'valid/minimal');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    // Create three instances of project settings, of which two are instances of the same settings; and one is unique.
    const configFile1 = join(
      decisionRecordsPath,
      '.cards',
      'local',
      Project.projectConfigFileName,
    );
    const configFile2 = join(
      emptyProjectPath,
      '.cards',
      'local',
      Project.projectConfigFileName,
    );
    const projectSettings1 = ProjectConfiguration.getInstance(configFile1);
    const projectSettings2 = ProjectConfiguration.getInstance(configFile2);
    const projectSettings3 = ProjectConfiguration.getInstance(configFile2);

    expect(projectSettings1.name).to.not.equal(projectSettings2.name);
    expect(projectSettings2.name).to.equal(projectSettings3.name);
    expect(projectSettings1.cardKeyPrefix).to.not.equal(
      projectSettings2.cardKeyPrefix,
    );
    expect(projectSettings2.cardKeyPrefix).to.equal(
      projectSettings3.cardKeyPrefix,
    );
  });

  it('create class - card operation (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardToOperateOn = 'decision_5';
    const templateCard = 'decision_1';
    const template = 'decision/templates/decision';

    const cardExists = project.hasCard(cardToOperateOn);
    expect(cardExists).to.equal(true);
    const templateObject = await project.createTemplateObjectByName(template);
    if (templateObject) {
      const templateCardExists = templateObject.hasCard(templateCard);
      expect(templateCardExists).to.equal(true);
    }
    const pathToCard = project.pathToCard(cardToOperateOn);
    expect(pathToCard).to.include('decision_5');
  });

  // Card and resource details.
  it('access card details by id (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardToOperateOn = 'decision_5';
    const cardExists = project.hasCard(cardToOperateOn);
    expect(cardExists).to.equal(true);

    const card = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
    });
    expect(card).to.not.equal(undefined);
    if (card) {
      expect(card.metadata?.title).to.equal('Decision Records');
      expect(card.metadata?.cardType).to.equal('decision/cardTypes/simplepage');
      expect(card.metadata?.workflowState).to.equal('Created');

      const templatePath = Project.templatePathFromCardPath(card);
      expect(templatePath).to.equal('');
    }
    const details = {
      contentType: 'adoc' as FileContentType,
      content: true,
      metadata: true,
      children: true,
      parent: true,
      attachments: true,
    };
    const additionalCardDetails = await project.cardDetailsById(
      cardToOperateOn,
      details,
    );
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
        additionalCardDetails.children?.find(
          (item) => item.key === 'decision_6',
        ),
      ).to.not.equal(undefined);
      expect(additionalCardDetails.parent).to.equal('root');
      expect(additionalCardDetails.content).to.not.equal(undefined);
    }

    const cardFolder = await project.cardFolder(cardToOperateOn);
    expect(basename(cardFolder)).to.equal(cardToOperateOn);
  });
  it('try to access card details with invalid card id', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardToOperateOn = 'decision_999';
    const card = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
    });
    expect(card).to.equal(undefined);
  });
  it('access card type details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardTypeDetails = await project.cardType(
      'decision/cardTypes/simplepage',
    );
    expect(cardTypeDetails).to.not.equal(undefined);
    if (cardTypeDetails) {
      expect(cardTypeDetails.workflow).to.equal('decision/workflows/simple');
    }
  });
  it('try to access card type details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardTypeDetails = await project.cardType('i-dont-exist');
    expect(cardTypeDetails).to.equal(undefined);
  });
  it('update card metadata (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = new Project(decisionRecordsPath);
    const card = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
    });
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousTitle = card?.metadata?.title;
      const previouslyUpdated = card?.metadata?.lastUpdated;
      const newTitle = 'TheTitle';
      await project.updateCardMetadataKey(card?.key, 'title', newTitle);
      const updatedCard = await project.cardDetailsById(cardToOperateOn, {
        metadata: true,
      });

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

    const project = new Project(decisionRecordsPath);
    const card = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
    });
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousTitle = card?.metadata?.title;
      const previouslyUpdated = card?.metadata?.lastUpdated;
      const newTitle = 'Decision Records';
      await project.updateCardMetadataKey(card?.key, 'title', newTitle);
      const updatedCard = await project.cardDetailsById(cardToOperateOn, {
        metadata: true,
      });

      // Expect the data be unchanged
      expect(previousTitle).to.equal(updatedCard?.metadata?.title);
      expect(previouslyUpdated).to.equal(updatedCard?.metadata?.lastUpdated);
      expect(updatedCard?.metadata?.title).to.equal(newTitle);
    }
  });
  it('try to update card with invalid metadata', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = new Project(decisionRecordsPath);
    const card = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
      content: true,
    });
    expect(card).to.not.equal(undefined);

    if (card) {
      // Trying to update wrong kind of data throws
      await project
        .updateCardMetadataKey(card?.key, 'workflowState', 'wrong-name')
        .then(() => expect(false))
        .catch(() => expect(true));
    }
  });
  it('update card content (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const cardToOperateOn = 'decision_5';

    const project = new Project(decisionRecordsPath);
    const card = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
      content: true,
    });
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

    const project = new Project(decisionRecordsPath);
    const card = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
      content: true,
    });
    expect(card).to.not.equal(undefined);

    if (card) {
      const previousContent = card.content;
      card.content += '\naddition';
      await project.updateCardContent(card.key, card.content!, true);
      expect(card.content).not.to.equal(previousContent);
    }
  });

  it('show all project cards', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const projectCards = await project.showProjectCards();
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
        expect(Project.isTemplateCard(projectCard)).to.equal(false);
      }
    }
  });
  it('empty project does not have cards', async () => {
    const emptyProjectPath = join(testDir, 'valid/minimal');
    const project = new Project(emptyProjectPath);
    expect(project).to.not.equal(undefined);

    const projectCards = await project.showProjectCards();
    expect(projectCards.length).to.equal(0);
  });
  it('access workflow details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const workflowDetails = await project.workflow('decision/workflows/simple');
    expect(workflowDetails).to.not.equal(undefined);
    if (workflowDetails) {
      expect(workflowDetails.states.length).to.equal(3);
      expect(workflowDetails.transitions.length).to.equal(3);
    }
  });
  it('try to access workflow details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const workflowDetails = await project.workflow('i-dont-exist');
    expect(workflowDetails).to.equal(undefined);
  });
  it('change card state (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardToOperateOn = 'decision_5';
    const state = 'Approved';
    const cardDetails = await project.cardDetailsById(cardToOperateOn, {
      metadata: true,
    });
    expect(cardDetails).to.not.equal(undefined);
    expect(cardDetails?.metadata?.workflowState).not.to.equal(state);

    const workflowDetails = await project.workflow('decision/workflows/simple');
    expect(workflowDetails).to.not.equal(undefined);
    const found = workflowDetails?.states.find((item) => item.name === state);
    expect(found).to.not.equal(undefined);
  });
  it('create template object from project (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);
    const template = await project.createTemplateObjectByName(
      'decision/templates/decision',
    );
    expect(template).to.not.equal(undefined);
  });
  it('create template object from project using card (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);
    const templateCards = await project.templateCards();
    expect(templateCards.length).to.be.greaterThan(0);
    if (templateCards && templateCards.at(0)) {
      const template = await project.createTemplateObjectFromCard(
        templateCards.at(0)!,
      );
      expect(template).to.not.equal(undefined);
    }
  });
  it('find certain card from project - content as adoc (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const nonExistingCard = await project.findSpecificCard('idontexist');
    expect(nonExistingCard).to.equal(undefined);

    const existingCard = await project.findSpecificCard('decision_5', {
      content: true,
      contentType: 'adoc',
    });
    expect(existingCard).to.not.equal(undefined);
  });
  it('find certain card from project - content as html (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const nonExistingCard = await project.findSpecificCard('idontexist');
    expect(nonExistingCard).to.equal(undefined);

    const existingCard = await project.findSpecificCard('decision_5', {
      content: true,
      contentType: 'html',
    });
    expect(existingCard).to.not.equal(undefined);
  });
  it('find certain card from project - card is from template (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);
    const existingCard = await project.findSpecificCard('decision_1', {
      content: true,
    });
    expect(existingCard).to.not.equal(undefined);
  });
  it('find certain card from project - using template card object and different details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const existingCard = await project.findSpecificCard('decision_1', {
      content: true,
    });
    expect(existingCard).to.not.equal(undefined);
    if (existingCard) {
      const sameReference = await project.findSpecificCard(existingCard, {
        content: true,
        metadata: true,
        parent: true,
      });
      expect(sameReference).to.not.equal(undefined);
    }
  });
  it('check if project is created (success)', () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);
    expect(Project.isCreated(decisionRecordsPath)).to.equal(true);
    expect(Project.isCreated('idontexist')).to.equal(false);
    expect(Project.isCreated('')).to.equal(false);
  });
  it('list all project cards (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const allProjectCards = await project.listAllCards(false);
    const allCards = await project.listAllCards(true);
    expect(allProjectCards).to.not.equal(undefined);
    expect(allCards).to.not.equal(undefined);
    expect(allProjectCards.length).to.be.lessThan(allCards.length);
    expect(allCards[0].type).to.equal('project');
    expect(allCards[0].cards.length).to.equal(2);
    expect(allCards[1].type).to.equal('template');
    expect(allCards[1].cards.length).to.equal(1);
  });
  it('check all attachments', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const attachmentFolder = await project.cardAttachmentFolder('decision_1');
    expect(attachmentFolder).to.include('decision_1');
    expect(attachmentFolder).to.include(`${sep}a`);

    const projectAttachments = await project.attachments();
    expect(projectAttachments.length).to.equal(1);
  });
  it('check all modules', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const modules = await project.modules();
    expect(modules.length).to.equal(0);
  });
  it('parse card path - project root card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    const cardId = 'decision_5';
    const card = await project.findSpecificCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = project.cardPathParts(
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
    const project = new Project(decisionRecordsPath);
    const cardId = 'decision_6';
    const card = await project.findSpecificCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = project.cardPathParts(
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
    const project = new Project(decisionRecordsPath);
    const cardId = 'decision_1';
    const card = await project.findSpecificCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = project.cardPathParts(
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
    const project = new Project(decisionRecordsPath);
    const cardId = 'decision_4';
    const card = await project.findSpecificCard(cardId);
    if (card) {
      const { template, cardKey, prefix, parents } = project.cardPathParts(
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
    const project = new Project(decisionRecordsPath);
    const { template, cardKey, prefix, parents } =
      project.cardPathParts('decision_1');
    expect(prefix).to.equal('decision');
    expect(cardKey).to.equal('decision_1');
    expect(template).to.equal('decision');
    expect(parents).to.equal([]); // no parents; root card
  });
  */
  it('parse card path - invalid card', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    try {
      project.cardPathParts('decision_99');
      expect(false);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      expect(true);
    }
  });
  it('collect all report handlebar files', async () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const miniRecordsPath = join(testDir, `valid${sep}minimal`);
    const projectDecision = new Project(decisionRecordsPath);
    const miniDecision = new Project(miniRecordsPath);
    let files = await projectDecision.reportHandlerBarFiles();
    // There are two handlebar files in the test project
    expect(files.length).to.equal(2);
    files = await miniDecision.reportHandlerBarFiles();
    // There are no handlebar files in the minimal report
    expect(files.length).to.equal(0);
  });

  it('create card type resource through resourceObject static API', () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    const ct = Project.resourceObject(
      project,
      resourceName('decision/cardTypes/decision'),
    );
    expect((ct as CardTypeResource).data).not.to.equal(undefined);
  });

  it('create field type resource through resourceObject static API', () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    const ft = Project.resourceObject(
      project,
      resourceName('decision/fieldTypes/finished'),
    );
    expect((ft as FieldTypeResource).data).not.to.equal(undefined);
  });

  it('create link type resource through resourceObject static API', () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    const lt = Project.resourceObject(
      project,
      resourceName('decision/linkTypes/test'),
    );
    expect((lt as LinkTypeResource).data).not.to.equal(undefined);
  });

  it('create workflow resource through resourceObject static API', () => {
    const decisionRecordsPath = join(testDir, `valid${sep}decision-records`);
    const project = new Project(decisionRecordsPath);
    const wf = Project.resourceObject(
      project,
      resourceName('decision/workflows/decision'),
    );
    expect((wf as WorkflowResource).data).not.to.equal(undefined);
  });

  // @todo: tests needed:
  // it('cardAttachments()', async () => { }); - requires test data in which project cards have attachments
  // modules in project: prefixes, ...
});
