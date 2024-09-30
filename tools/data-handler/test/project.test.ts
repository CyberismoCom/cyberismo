// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

// ismo
import { copyDir } from '../src/utils/file-utils.js';
import { Project } from '../src/containers/project.js';
import { ProjectSettings } from '../src/project-settings.js';
import { fileURLToPath } from 'node:url';

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

    const cardrootFolder = project.cardrootFolder;
    const cardtypesFolder = project.cardtypesFolder;
    const templatesFolder = project.templatesFolder;
    const workflowsFolder = project.workflowsFolder;
    const resourcesFolder = project.resourcesFolder;
    const modulesFolder = project.modulesFolder;

    expect(cardrootFolder).to.include('cardroot');
    expect(cardtypesFolder).to.include('cardtypes');
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
    const cardtypes = await project.cardtypes();
    expect(cardtypes.length).to.equal(2);
    const cardType1 = await project.cardType(cardtypes[0].name);
    const cardType2 = await project.cardType(cardtypes[1].name);
    expect(cardType1).to.not.equal(undefined);
    expect(cardType2).to.not.equal(undefined);
    const templates = await project.templates();
    expect(templates.length).to.equal(3);
    if (templates) {
      for (const template of templates) {
        expect(await project.templateExists(template.name)).to.equal(true);
        const fetchTemplate = await project.template(template.name);
        expect(fetchTemplate).to.equal(template);
      }
    }
    expect(await project.templateExists('idontexist')).to.equal(false);

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
    expect(projectDetails.path).to.equal(resolve(project.cardrootFolder, '..'));
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
    const projectSettings = ProjectSettings.getInstance(configFile);
    expect(projectSettings).to.not.equal(undefined);

    const prefix = projectSettings.cardkeyPrefix;
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
    const projectSettings1 = ProjectSettings.getInstance(configFile1);
    const projectSettings2 = ProjectSettings.getInstance(configFile2);
    const projectSettings3 = ProjectSettings.getInstance(configFile2);

    expect(projectSettings1.name).to.not.equal(projectSettings2.name);
    expect(projectSettings2.name).to.equal(projectSettings3.name);
    expect(projectSettings1.cardkeyPrefix).to.not.equal(
      projectSettings2.cardkeyPrefix,
    );
    expect(projectSettings2.cardkeyPrefix).to.equal(
      projectSettings3.cardkeyPrefix,
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
      expect(card.metadata?.cardtype).to.equal(
        'decision/cardtypes/simplepage-cardtype',
      );
      expect(card.metadata?.workflowState).to.equal('Created');

      const templatePath = Project.templatePathFromCardPath(card);
      expect(templatePath).to.equal('');
    }
    const details = {
      contentType: 'adoc',
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
      expect(additionalCardDetails.metadata?.cardtype).to.equal(
        'decision/cardtypes/simplepage-cardtype',
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
  it('access cardtype details (success)', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardTypeDetails = await project.cardType(
      'decision/cardtypes/simplepage-cardtype',
    );
    expect(cardTypeDetails).to.not.equal(undefined);
    if (cardTypeDetails) {
      expect(cardTypeDetails.name).to.equal(
        'decision/cardtypes/simplepage-cardtype',
      );
      expect(cardTypeDetails.workflow).to.equal(
        'decision/workflows/simple-workflow',
      );
    }
  });
  it('try to access cardtype details with non-existing name', async () => {
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    const project = new Project(decisionRecordsPath);
    expect(project).to.not.equal(undefined);

    const cardTypeDetails = await project.cardType('i-dont-exist');
    expect(cardTypeDetails).to.equal(undefined);
  });
  it('update metadata (success)', async () => {
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
      await project.updateCardMetadata(card?.key, 'title', newTitle);
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
      await project.updateCardMetadata(card?.key, 'title', previousTitle);
    }
  });
  it('try to update metadata with same content again', async () => {
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
      await project.updateCardMetadata(card?.key, 'title', newTitle);
      const updatedCard = await project.cardDetailsById(cardToOperateOn, {
        metadata: true,
      });

      // Expect the data be unchanged
      expect(previousTitle).to.equal(updatedCard?.metadata?.title);
      expect(previouslyUpdated).to.equal(updatedCard?.metadata?.lastUpdated);
      expect(updatedCard?.metadata?.title).to.equal(newTitle);
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

    const workflowDetails = await project.workflow(
      'decision/workflows/simple-workflow',
    );
    expect(workflowDetails).to.not.equal(undefined);
    if (workflowDetails) {
      expect(workflowDetails.name).to.equal(
        'decision/workflows/simple-workflow',
      );
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

    const workflowDetails = await project.workflow(
      'decision/workflows/simple-workflow',
    );
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

  // @todo: tests needed:
  // it('cardAttachments()', async () => { }); - requires test data in which project cards have attachments
  // modules in project: moduleNames, prefixes, ...
});
