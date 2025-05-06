// testing
import { expect } from 'chai';

// node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';

import { Calculate, Create, Import, Remove } from '../src/commands/index.js';
import { Project } from '../src/containers/project.js';
import { ResourceCollector } from '../src/containers/project/resource-collector.js';
import { resourceName } from '../src/utils/resource-utils.js';
import type {
  RemovableResourceTypes,
  ResourceFolderType,
} from '../src/interfaces/project-interfaces.js';

import { CardTypeResource } from '../src/resources/card-type-resource.js';
import { FieldTypeResource } from '../src/resources/field-type-resource.js';
import { GraphModelResource } from '../src/resources/graph-model-resource.js';
import { GraphViewResource } from '../src/resources/graph-view-resource.js';
import { LinkTypeResource } from '../src/resources/link-type-resource.js';
import { ReportResource } from '../src/resources/report-resource.js';
import { TemplateResource } from '../src/resources/template-resource.js';
import { WorkflowResource } from '../src/resources/workflow-resource.js';

import type {
  CardType,
  CustomField,
  EnumDefinition,
  FieldType,
  GraphModel,
  GraphView,
  LinkType,
  ReportMetadata,
  TemplateMetadata,
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../src/interfaces/resource-interfaces.js';

import type {
  AddOperation,
  ChangeOperation,
  RemoveOperation,
} from '../src/resources/resource-object.js';

describe('resources', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-resource-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  const minimalPath = join(testDir, 'valid/minimal');
  let project: Project;

  // Some of the commands are used in testing.
  let calculateCmd: Calculate;
  let createCmd: Create;
  let importCmd: Import;
  let removeCmd: Remove;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(decisionRecordsPath);
    calculateCmd = new Calculate(project);
    createCmd = new Create(project, calculateCmd);
    importCmd = new Import(project, createCmd);
    removeCmd = new Remove(project, calculateCmd);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('resource-collector', () => {
    it('collect resources locally', async () => {
      const collector = new ResourceCollector(project);

      // Before collecting the resources, there shouldn't be anything.
      expect((await collector.resources('calculations')).length).to.equal(0);
      expect((await collector.resources('cardTypes')).length).to.equal(0);
      expect((await collector.resources('fieldTypes')).length).to.equal(0);
      expect((await collector.resources('graphModels')).length).to.equal(0);
      expect((await collector.resources('graphViews')).length).to.equal(0);
      expect((await collector.resources('linkTypes')).length).to.equal(0);
      expect((await collector.resources('reports')).length).to.equal(0);
      expect((await collector.resources('templates')).length).to.equal(0);
      expect((await collector.resources('workflows')).length).to.equal(0);
      collector.collectLocalResources();

      // After collecting the resources, arrays are populated.
      const calcCount = (await collector.resources('calculations')).length;
      const cardTypesCount = (await collector.resources('cardTypes')).length;
      const fieldTypesCount = (await collector.resources('fieldTypes')).length;
      const graphModelCount = (await collector.resources('graphModels')).length;
      const graphViewCount = (await collector.resources('graphViews')).length;
      const linkTypesCount = (await collector.resources('linkTypes')).length;
      const reportsCount = (await collector.resources('reports')).length;
      const templatesCount = (await collector.resources('templates')).length;
      const workflowsCount = (await collector.resources('workflows')).length;

      expect(calcCount).not.to.equal(0);
      expect(cardTypesCount).not.to.equal(0);
      expect(fieldTypesCount).not.to.equal(0);
      expect(graphModelCount).not.to.equal(0);
      expect(graphViewCount).not.to.equal(0);
      expect(linkTypesCount).not.to.equal(0);
      expect(reportsCount).not.to.equal(0);
      expect(templatesCount).not.to.equal(0);
      expect(workflowsCount).not.to.equal(0);

      // Calling collect again does not affect the arrays
      collector.collectLocalResources();

      const calcCountAgain = (await collector.resources('calculations')).length;
      const cardTypesCountAgain = (await collector.resources('cardTypes'))
        .length;
      const fieldTypesCountAgain = (await collector.resources('fieldTypes'))
        .length;
      const graphModelCountAgain = (await collector.resources('graphModels'))
        .length;
      const graphViewCountAgain = (await collector.resources('graphViews'))
        .length;
      const linkTypesCountAgain = (await collector.resources('linkTypes'))
        .length;
      const reportsCountAgain = (await collector.resources('reports')).length;
      const templatesCountAgain = (await collector.resources('templates'))
        .length;
      const workflowsCountAgain = (await collector.resources('workflows'))
        .length;

      expect(calcCount).to.equal(calcCountAgain);
      expect(cardTypesCount).to.equal(cardTypesCountAgain);
      expect(fieldTypesCount).to.equal(fieldTypesCountAgain);
      expect(graphModelCount).to.equal(graphModelCountAgain);
      expect(graphViewCount).to.equal(graphViewCountAgain);
      expect(linkTypesCount).to.equal(linkTypesCountAgain);
      expect(reportsCount).to.equal(reportsCountAgain);
      expect(templatesCount).to.equal(templatesCountAgain);
      expect(workflowsCount).to.equal(workflowsCountAgain);

      // Since there are no modules imported, collecting module resources does not affect
      // resource arrays.
      const moduleCalcs =
        await collector.collectResourcesFromModules('calculations');
      const moduleCardTypes =
        await collector.collectResourcesFromModules('cardTypes');
      const moduleFieldTypes =
        await collector.collectResourcesFromModules('fieldTypes');
      const moduleGraphModels =
        await collector.collectResourcesFromModules('graphModels');
      const moduleGraphViews =
        await collector.collectResourcesFromModules('graphViews');
      const moduleLinkTypes =
        await collector.collectResourcesFromModules('linkTypes');
      const moduleReports =
        await collector.collectResourcesFromModules('reports');
      const moduleTemplates =
        await collector.collectResourcesFromModules('templates');
      const moduleWorkflows =
        await collector.collectResourcesFromModules('workflows');
      collector.collectLocalResources();

      expect(moduleCalcs.length).to.equal(0);
      expect(moduleCardTypes.length).to.equal(0);
      expect(moduleFieldTypes.length).to.equal(0);
      expect(moduleGraphModels.length).to.equal(0);
      expect(moduleGraphViews.length).to.equal(0);
      expect(moduleLinkTypes.length).to.equal(0);
      expect(moduleReports.length).to.equal(0);
      expect(moduleTemplates.length).to.equal(0);
      expect(moduleWorkflows.length).to.equal(0);

      expect((await collector.resources('calculations')).length).to.equal(
        calcCount,
      );
      expect((await collector.resources('cardTypes')).length).to.equal(
        cardTypesCount,
      );
      expect((await collector.resources('fieldTypes')).length).to.equal(
        fieldTypesCount,
      );
      expect((await collector.resources('graphModels')).length).to.equal(
        graphModelCount,
      );
      expect((await collector.resources('graphViews')).length).to.equal(
        graphViewCount,
      );
      expect((await collector.resources('linkTypes')).length).to.equal(
        linkTypesCount,
      );
      expect((await collector.resources('reports')).length).to.equal(
        reportsCount,
      );
      expect((await collector.resources('templates')).length).to.equal(
        templatesCount,
      );
      expect((await collector.resources('workflows')).length).to.equal(
        workflowsCount,
      );
    });

    it('collect resources locally and from module', async () => {
      const collector = new ResourceCollector(project);

      // Store the resource counts before import.
      // Note that minimal project does not have fieldTypes, graphModels, graphViews, linkTypes or reports
      collector.collectLocalResources();
      const calcCount = (await collector.resources('calculations')).length;
      const cardTypesCount = (await collector.resources('cardTypes')).length;
      const templatesCount = (await collector.resources('templates')).length;
      const workflowsCount = (await collector.resources('workflows')).length;

      await importCmd.importModule(minimalPath, project.basePath);
      await collector.moduleImported();

      const calcCountAgain = (await collector.resources('calculations')).length;
      const cardTypesCountAgain = (await collector.resources('cardTypes'))
        .length;
      const templatesCountAgain = (await collector.resources('templates'))
        .length;
      const workflowsCountAgain = (await collector.resources('workflows'))
        .length;

      expect(calcCount).to.be.lessThan(calcCountAgain);
      expect(cardTypesCount).to.be.lessThan(cardTypesCountAgain);
      expect(templatesCount).to.be.lessThan(templatesCountAgain);
      expect(workflowsCount).to.be.lessThan(workflowsCountAgain);
    });

    it('add and remove workflow', async () => {
      const collector = new ResourceCollector(project);
      collector.collectLocalResources();

      // Initially, there are no resources in the cache.
      expect(project.resourceCache.size).to.equal(0);

      const workflowsCount = (await collector.resources('workflows')).length;
      const nameForWorkflow = `${project.projectPrefix}/workflows/newOne`;
      const fileName = nameForWorkflow;

      // Creating new resources automatically updates collector arrays, but only for
      // instance that is owned by the Project. The tested 'collector' instance needs
      // to be updated by calling 'collectLocalResources()'.
      await createCmd.createWorkflow(fileName, '');
      collector.collectLocalResources();
      let exists = await collector.resourceExists('workflows', fileName);
      expect(exists).to.equal(true);
      const workflowsCountAgain = (await collector.resources('workflows'))
        .length;
      expect(workflowsCount + 1).to.equal(workflowsCountAgain);

      // Creating a resource puts it automatically to cache.
      expect(project.resourceCache.size).to.equal(1);

      // Removing resources automatically updates collector arrays, but only for
      // instance that is owned by the Project (and it is not public).
      // The tested 'collector' instance needs to be updated by calling 'collectLocalResources()'.
      await removeCmd.remove('workflow', nameForWorkflow);
      collector.collectLocalResources();
      exists = await collector.resourceExists('workflows', fileName);
      expect(exists).to.equal(false);

      // We are not checking cache after remove, since workflow depends on
      // card type resource and removing workflow, means that all card types
      // are cached, which in turn makes all field types to be cached.
    });

    it('add and remove other file based resources', async () => {
      const collector = new ResourceCollector(project);

      async function checkResource(type: string) {
        const resourceType = type as ResourceFolderType;
        const removeType = resourceType.substring(0, resourceType.length - 1);
        const resourceCount = (await collector.resources(resourceType)).length;
        const nameForResource = `${project.projectPrefix}/${resourceType}/newOne`;
        const fileName = nameForResource;

        if (type === 'cardTypes') {
          await createCmd.createCardType(
            fileName,
            'decision/workflows/decision',
          );
        } else if (type === 'fieldTypes') {
          await createCmd.createFieldType(fileName, 'shortText');
        } else if (type === 'linkTypes') {
          await createCmd.createLinkType(fileName);
        } else {
          expect(false).to.equal(true);
          return;
        }
        collector.collectLocalResources();
        let exists = await collector.resourceExists(resourceType, fileName);
        expect(exists).to.equal(true);
        const resourceCountLater = (await collector.resources(resourceType))
          .length;
        expect(resourceCount + 1).to.equal(resourceCountLater);

        await removeCmd.remove(removeType as RemovableResourceTypes, fileName);
        collector.collectLocalResources();
        exists = await collector.resourceExists(resourceType, fileName);
        expect(exists).to.equal(false);
      }

      collector.collectLocalResources();

      await checkResource('cardTypes');
      await checkResource('linkTypes');
      await checkResource('fieldTypes');
    });

    it('add and remove folder based resources', async () => {
      const collector = new ResourceCollector(project);
      collector.collectLocalResources();

      async function checkResource(type: string) {
        const resourceType = type as ResourceFolderType;
        const removeType = resourceType.substring(0, resourceType.length - 1);
        const resourceCount = (await collector.resources(resourceType)).length;
        const nameForResource = `${project.projectPrefix}/${resourceType}/newOne`;

        if (type === 'templates') {
          await createCmd.createTemplate(nameForResource, '');
        } else if (type === 'reports') {
          await createCmd.createReport(nameForResource);
        } else if (type === 'graphModels') {
          await createCmd.createGraphModel(nameForResource);
        } else if (type === 'graphViews') {
          await createCmd.createGraphView(nameForResource);
        } else {
          expect(false).to.equal(true);
        }
        collector.collectLocalResources();
        let exists = await collector.resourceExists(
          resourceType,
          nameForResource,
        );
        expect(exists).to.equal(true);
        const resourceCountLater = (await collector.resources(resourceType))
          .length;
        expect(resourceCount + 1).to.equal(resourceCountLater);

        await removeCmd.remove(
          removeType as RemovableResourceTypes,
          nameForResource,
        );
        exists = await collector.resourceExists(resourceType, nameForResource);
        expect(exists).to.equal(false);
      }

      checkResource('graphModels');
      checkResource('graphViews');
      checkResource('reports');
      checkResource('templates');
    });
  });

  describe('resource basic operations', () => {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const testDir = join(baseDir, 'tmp-resource-classes-tests');
    const decisionRecordsPath = join(testDir, 'valid/decision-records');
    let project: Project;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(decisionRecordsPath);
    });

    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('create card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newCT'),
      );
      const before = await project.cardTypes();
      let found = before.find(
        (item) => item.name === 'decision/cardTypes/newCT',
      );
      expect(found).to.equal(undefined);
      await res.createCardType('decision/workflows/decision');
      const after = await project.cardTypes();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newFT'),
      );
      const before = await project.fieldTypes();
      let found = before.find(
        (item) => item.name === 'decision/fieldTypes/newFT',
      );
      expect(found).to.equal(undefined);
      await res.createFieldType('shortText');
      const after = await project.fieldTypes();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create graph model', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newGM'),
      );
      const before = await project.graphModels();
      let found = before.find(
        (item) => item.name === 'decision/graphModels/newGM',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.graphModels();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create graph view', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newGV'),
      );
      const before = await project.graphViews();
      let found = before.find(
        (item) => item.name === 'decision/graphViews/newGV',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.graphViews();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newLT'),
      );
      const before = await project.linkTypes();
      let found = before.find(
        (item) => item.name === 'decision/linkTypes/newLT',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.linkTypes();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create link type with provided content', async () => {
      const name = 'decision/linkTypes/newLTWithContent';
      const res = new LinkTypeResource(project, resourceName(name));
      const before = await project.linkTypes();
      let found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      const linkTypeData = {
        name: name,
        inboundDisplayName: 'in',
        outboundDisplayName: 'out',
        destinationCardTypes: ['decision/cardTypes/decision'],
        sourceCardTypes: ['decision/cardTypes/decision'],
        enableLinkDescription: false,
      } as LinkType;
      await res.create(linkTypeData);
      const after = await project.linkTypes();
      found = after.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('try to create link type with invalid provided content', async () => {
      const name = 'decision/linkTypes/invalidLTWithContent';
      const res = new LinkTypeResource(project, resourceName(name));
      const before = await project.linkTypes();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      const linkTypeData = {
        // missing mandatory value 'enableLinkDescription'
        // note that interface should be such that property is mandatory.
        name: name,
        inboundDisplayName: 'in',
        outboundDisplayName: 'out',
        destinationCardTypes: ['decision/cardTypes/decision'],
        sourceCardTypes: ['decision/cardTypes/decision'],
      } as LinkType;
      await res
        .create(linkTypeData)
        .then(() => {
          expect(false).to.equal(true);
        })
        .catch((error) => {
          // note that there is sometimes extra whitespace at the end of error messages.
          expect(error.message.trim()).to.equal(
            `Invalid content JSON: Schema 'linkTypeSchema' validation Error: requires property "enableLinkDescription"`,
          );
        });
    });
    it('create report', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/newREP'),
      );
      const before = await project.reports();
      let found = before.find(
        (item) => item.name === 'decision/reports/newREP',
      );
      expect(found).to.equal(undefined);
      await res.createReport();
      const after = await project.reports();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create template', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/newTEMP'),
      );
      const before = await project.templates();
      let found = before.find(
        (item) => item.name === 'decision/templates/newTEMP',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.templates();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create template with provided content', async () => {
      const name = 'decision/templates/newTEMPWithContent';
      const res = new TemplateResource(project, resourceName(name));
      const before = await project.templates();
      let found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      const templateData = {
        name: name,
        displayName: 'Test template with content',
        description: 'No description',
        category: 'Random category',
      } as TemplateMetadata;
      await res.create(templateData);
      const after = await project.templates();
      found = after.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('try to create template with invalid provided content', async () => {
      const name = 'decision/templates/newTEMPWithInvalidContent';
      const res = new TemplateResource(project, resourceName(name));
      const before = await project.templates();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      const templateData = {
        // missing name
        displayName: 'Test template with content',
        description: 'No description',
        category: 'Random category',
      } as TemplateMetadata;
      await res
        .create(templateData)
        .then(() => {
          expect(false).to.equal(true);
        })
        .catch((error) => {
          // note that there is sometimes extra whitespace at the end of error messages.
          expect(error.message.trim()).to.equal(
            `Invalid content JSON: Schema 'templateSchema' validation Error: requires property "name"`,
          );
        });
    });
    it('create workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const before = await project.workflows();
      let found = before.find(
        (item) => item.name === 'decision/workflows/newWF',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.workflows();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create workflow with provided content', async () => {
      const name = 'decision/workflows/newWFWithContent';
      const res = new WorkflowResource(project, resourceName(name));
      const before = await project.workflows();
      let found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      const workflowData = {
        name: name,
        states: [],
        transitions: [],
      } as Workflow;
      await res.create(workflowData);
      const after = await project.workflows();
      found = after.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('try to create card type with invalid name', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/new-ööö'),
      );
      await res
        .createCardType('decision/workflows/decision')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
            );
          }
        });
    });
    it('try to create field type with invalid name', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/new-ööö'),
      );
      await res
        .createFieldType('shortText')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
            );
          }
        });
    });
    it('try to create link type with invalid name', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/new-ööö'),
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
            );
          }
        });
    });
    it('try to create graph model with invalid name', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newÄ'),
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'newÄ' is invalid",
            );
          }
        });
    });
    it('try to create graph view with invalid name', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newÖ'),
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'newÖ' is invalid",
            );
          }
        });
    });
    it('try to create report with invalid name', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/new-ööö'),
      );
      await res
        .createReport()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
            );
          }
        });
    });
    it('try to create template with invalid name', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/new-ööö'),
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
            );
          }
        });
    });
    it('try to create workflow with invalid name', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/new-ööö'),
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
            );
          }
        });
    });
    it('try to create card type with invalid type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/workflows/new-one'),
      );
      await res
        .createCardType('decision/workflows/decision')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name must match the resource type. Type 'workflows' does not match 'cardTypes'",
            );
          }
        });
    });
    it('try to create field type with invalid type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/workflows/new-one'), // cannot create from workflows
      );
      await res
        .createFieldType('shortText')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name must match the resource type. Type 'workflows' does not match 'fieldTypes'",
            );
          }
        });
    });
    it('try to create field type with invalid type', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/workflows/new-one'), // cannot create from workflows
      );
      await res
        .createReport()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name must match the resource type. Type 'workflows' does not match 'reports'",
            );
          }
        });
    });
    it('try to create resources with invalid types', async () => {
      const resources = [
        // cannot create any of these with 'cardTypes' in name
        new GraphModelResource(
          project,
          resourceName('decision/cardTypes/new-one'),
        ),
        new GraphViewResource(
          project,
          resourceName('decision/cardTypes/new-one'),
        ),
        new LinkTypeResource(
          project,
          resourceName('decision/cardTypes/new-one'),
        ),
        new TemplateResource(
          project,
          resourceName('decision/cardTypes/new-one'),
        ),
        new WorkflowResource(
          project,
          resourceName('decision/cardTypes/new-one'),
        ),
      ];
      for (const res of resources) {
        await res
          .create()
          .then(() => expect(false).to.equal(true))
          .catch((err) => {
            if (err instanceof Error) {
              expect(err.message).to.include(
                "Resource name must match the resource type. Type 'cardTypes' does not match",
              );
            }
          });
      }
    });
    it('try to create card type with invalid project prefix', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('unknown/cardTypes/new-one'),
      );
      await res
        .createCardType('decision/workflows/decision')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
            );
          }
        });
    });
    it('try to create field type with invalid project prefix', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('unknown/fieldTypes/new-one'),
      );
      await res
        .createFieldType('shortText')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
            );
          }
        });
    });
    it('try to create resources with invalid project prefix', async () => {
      // Include only resources that can be created with call to 'create()'
      const resources = [
        new GraphModelResource(
          project,
          resourceName('unknown/graphModels/new-one'),
        ),
        new GraphViewResource(
          project,
          resourceName('unknown/graphViews/new-one'),
        ),
        new LinkTypeResource(
          project,
          resourceName('unknown/linkTypes/new-one'),
        ),
        new TemplateResource(
          project,
          resourceName('unknown/templates/new-one'),
        ),
        new WorkflowResource(
          project,
          resourceName('unknown/workflows/new-one'),
        ),
      ];
      for (const res of resources) {
        await res
          .create()
          .then(() => expect(false).to.equal(true))
          .catch((err) => {
            if (err instanceof Error) {
              expect(err.message).to.equal(
                "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
              );
            }
          });
      }
    });
    it('try to create report with invalid project prefix', async () => {
      const res = new ReportResource(
        project,
        resourceName('unknown/reports/new-one'),
      );
      await res
        .createReport()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
            );
          }
        });
    });
    it('try to create card type with invalid content', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/new-one'),
      );
      await res
        .createCardType('decision/workflows/does-not-exist') // invalid workflow
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Workflow 'decision/workflows/does-not-exist' does not exist in the project",
            );
          }
        });
    });
    it('data of card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newCT'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/cardTypes/newCT',
          workflow: 'decision/workflows/decision',
          customFields: [],
          alwaysVisibleFields: [],
          optionallyVisibleFields: [],
        }),
      );
    });
    it('data of field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newFT'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/fieldTypes/newFT',
          dataType: 'shortText',
        }),
      );
    });
    it('data of graph model', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newGM'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/graphModels/newGM',
          displayName: '',
          description: '',
        }),
      );
    });
    it('data of graph view', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newGV'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/graphViews/newGV',
          displayName: '',
          description: '',
        }),
      );
    });
    it('data of link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newLT'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/linkTypes/newLT',
          outboundDisplayName: 'decision/linkTypes/newLT',
          inboundDisplayName: 'decision/linkTypes/newLT',
          sourceCardTypes: [],
          destinationCardTypes: [],
          enableLinkDescription: false,
        }),
      );
    });
    it('data of report', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/newREP'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/reports/newREP',
          displayName: '',
          description: '',
          category: 'Uncategorised report',
        }),
      );
    });
    it('data of template', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/newTEMP'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/templates/newTEMP',
        }),
      );
    });
    it('data of workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/workflows/newWF',
          states: [
            { name: 'Draft', category: 'initial' },
            { name: 'Approved', category: 'closed' },
            { name: 'Deprecated', category: 'closed' },
          ],
          transitions: [
            { name: 'Create', fromState: [''], toState: 'Draft' },
            { name: 'Approve', fromState: ['Draft'], toState: 'Approved' },
            { name: 'Archive', fromState: ['*'], toState: 'Deprecated' },
          ],
        }),
      );
    });
    // Show is basically same as '.data' - it just has extra validation.
    it('show card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newCT'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/cardTypes/newCT',
          workflow: 'decision/workflows/decision',
          customFields: [],
          alwaysVisibleFields: [],
          optionallyVisibleFields: [],
        }),
      );
    });
    it('show field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newFT'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/fieldTypes/newFT',
          dataType: 'shortText',
        }),
      );
    });
    it('show graph model', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newGM'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/graphModels/newGM',
          displayName: '',
          description: '',
          calculationFile: 'model.lp',
        }),
      );
    });
    it('show graph view', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newGV'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/graphViews/newGV',
          displayName: '',
          description: '',
          handleBarFile: 'view.lp.hbs',
        }),
      );
    });
    it('show link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newLT'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/linkTypes/newLT',
          outboundDisplayName: 'decision/linkTypes/newLT',
          inboundDisplayName: 'decision/linkTypes/newLT',
          sourceCardTypes: [],
          destinationCardTypes: [],
          enableLinkDescription: false,
        }),
      );
    });
    it('show report', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/newREP'),
      );
      const data = await res.show();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { contentTemplate, queryTemplate, ...others } = data;
      expect(JSON.stringify(others)).to.equal(
        JSON.stringify({
          name: 'decision/reports/newREP',
          metadata: {
            name: 'decision/reports/newREP',
            displayName: '',
            description: '',
            category: 'Uncategorised report',
          },
          schema: {
            title: 'Report',
            $id: 'reportMacroDefaultSchema',
            description:
              'A report object provides supplemental information about a report',
            type: 'object',
            properties: {
              name: { description: 'The name of the report', type: 'string' },
              cardKey: {
                description:
                  'Used to override the default cardKey, which is the cardKey of the card, in which the report macro is used',
                type: 'string',
              },
            },
            additionalProperties: false,
            required: ['name'],
          },
        }),
      );
    });
    // Tests that report data can be shown from a module; ensures that
    // all report files are reachable; even if their content is not validated.
    it('show imported report', async () => {
      const projectMini = new Project(minimalPath);
      const calculateCmdMini = new Calculate(projectMini);
      const createCmdMini = new Create(projectMini, calculateCmdMini);
      const importCmdMini = new Import(projectMini, createCmdMini);
      const collectorMini = new ResourceCollector(projectMini);
      await importCmdMini.importModule(
        decisionRecordsPath,
        projectMini.basePath,
      );
      await collectorMini.moduleImported();
      const res = new ReportResource(
        projectMini,
        resourceName('decision/reports/newREP'),
      );
      const data = await res.show();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { contentTemplate, queryTemplate, ...others } = data;
      expect(JSON.stringify(others)).to.equal(
        JSON.stringify({
          name: 'decision/reports/newREP',
          metadata: {
            name: 'decision/reports/newREP',
            displayName: '',
            description: '',
            category: 'Uncategorised report',
          },
          schema: {
            title: 'Report',
            $id: 'reportMacroDefaultSchema',
            description:
              'A report object provides supplemental information about a report',
            type: 'object',
            properties: {
              name: { description: 'The name of the report', type: 'string' },
              cardKey: {
                description:
                  'Used to override the default cardKey, which is the cardKey of the card, in which the report macro is used',
                type: 'string',
              },
            },
            additionalProperties: false,
            required: ['name'],
          },
        }),
      );
    });

    it('show template', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/newTEMP'),
      );
      const data = await res.show();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { path, ...others } = data;
      expect(JSON.stringify(others)).to.equal(
        JSON.stringify({
          metadata: { name: 'decision/templates/newTEMP' },
          name: 'decision/templates/newTEMP',
          numberOfCards: 0,
        }),
      );
    });
    it('show workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/workflows/newWF',
          states: [
            { name: 'Draft', category: 'initial' },
            { name: 'Approved', category: 'closed' },
            { name: 'Deprecated', category: 'closed' },
          ],
          transitions: [
            { name: 'Create', fromState: [''], toState: 'Draft' },
            { name: 'Approve', fromState: ['Draft'], toState: 'Approved' },
            { name: 'Archive', fromState: ['*'], toState: 'Deprecated' },
          ],
        }),
      );
    });
    it('validate resources', async () => {
      const resources = [
        new CardTypeResource(project, resourceName('decision/cardTypes/newCT')),
        new FieldTypeResource(
          project,
          resourceName('decision/fieldTypes/newFT'),
        ),
        new GraphModelResource(
          project,
          resourceName('decision/graphModels/newGM'),
        ),
        new GraphViewResource(
          project,
          resourceName('decision/graphViews/newGV'),
        ),
        new LinkTypeResource(project, resourceName('decision/linkTypes/newLT')),
        new ReportResource(project, resourceName('decision/reports/newREP')),
        new TemplateResource(
          project,
          resourceName('decision/templates/newTEMP'),
        ),
        new WorkflowResource(project, resourceName('decision/workflows/newWF')),
      ];
      for (const resource of resources) {
        await resource.validate().catch(() => expect(false).to.equal(true));
      }
    });
    it('try to validate missing resource types', async () => {
      const resources = [
        new CardTypeResource(
          project,
          resourceName('decision/cardTypes/i-do-not-exist'),
        ),
        new FieldTypeResource(
          project,
          resourceName('decision/fieldTypes/i-do-not-exist'),
        ),
        new GraphModelResource(
          project,
          resourceName('decision/graphModels/i-do-not-exist'),
        ),
        new GraphViewResource(
          project,
          resourceName('decision/graphViews/i-do-not-exist'),
        ),
        new LinkTypeResource(
          project,
          resourceName('decision/linkTypes/i-do-not-exist'),
        ),
        new ReportResource(
          project,
          resourceName('decision/reports/i-do-not-exist'),
        ),
        new TemplateResource(
          project,
          resourceName('decision/templates/i-do-not-exist'),
        ),
        new WorkflowResource(
          project,
          resourceName('decision/workflows/i-do-not-exist'),
        ),
      ];
      for (const resource of resources) {
        await resource.validate().catch(() => expect(true).to.equal(true));
      }
    });
    it('rename card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newResForRename'),
      );
      await res.createCardType('decision/workflows/decision');
      await res.rename(resourceName('decision/cardTypes/newname'));
      expect(res.data.name).equals('decision/cardTypes/newname');
      await res.delete();
    });
    it('rename graph model', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/graphModels/newname'));
      expect(res.data.name).equals('decision/graphModels/newname');
      await res.delete();
    });
    it('rename graph view', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/graphViews/newname'));
      expect(res.data.name).equals('decision/graphViews/newname');
      await res.delete();
    });
    it('rename field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newResForRename'),
      );
      await res.createFieldType('shortText');
      await res.rename(resourceName('decision/fieldTypes/newname'));
      expect(res.data.name).equals('decision/fieldTypes/newname');
      await res.delete();
    });
    it('rename link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/linkTypes/newname'));
      expect(res.data.name).equals('decision/linkTypes/newname');
      await res.delete();
    });
    it('rename report', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/newResForRename'),
      );
      await res.createReport();
      await res.rename(resourceName('decision/reports/newname'));
      expect(res.data.name).equals('decision/reports/newname');
      await res.delete();
    });
    it('rename template', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/templates/newname'));
      expect(res.data.name).equals('decision/templates/newname');
      await res.delete();
    });
    it('rename workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/workflows/newname'));
      expect(res.data.name).equals('decision/workflows/newname');
      await res.delete();
    });
    it('try to rename workflow - attempt to change prefix', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await res
        .rename(resourceName('newpre/workflows/newname'))
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.include('Can only rename project resources');
          }
        });
      await res.delete();
    });
    it('try to rename workflow - attempt to change type', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await res
        .rename(resourceName('decision/linkTypes/newname'))
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.include('Cannot change resource type');
          }
        });
      await res.delete();
    });
    it('try to rename workflow - attempt to use invalid name', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await res
        .rename(resourceName('decision/workflows/newname-ööö'))
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.include(
              'Resource identifier must follow naming',
            );
          }
        });
      await res.delete();
    });
    it('update card type - name', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/forRename'),
      );
      await res.createCardType('decision/workflows/decision');
      await res.update('name', {
        name: 'change',
        target: '',
        to: 'decision/cardTypes/afterUpdate',
      });
      expect(res.data?.name).to.equal('decision/cardTypes/afterUpdate');
    });
    it('update card type - try to "rank" scalar "name"', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/tryForUpdate'),
      );
      await res.createCardType('decision/workflows/decision');
      await res
        .update('name', {
          name: 'rank',
          target: '',
          newIndex: 99,
        })
        .then(() => {
          expect(false).to.equal(true);
        })
        .catch((error) => {
          expect(error.message).to.equal(
            'Cannot do operation rank on scalar value',
          );
        });
    });
    it('update card type - try to "add" scalar "name"', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/tryForUpdate'),
      );
      await res
        .update('name', {
          name: 'add',
          target: '',
        })
        .then(() => {
          expect(false).to.equal(true);
        })
        .catch((error) => {
          expect(error.message).to.equal(
            'Cannot do operation add on scalar value',
          );
        });
    });
    it('update card type - try to "remove" scalar "name"', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/tryForUpdate'),
      );
      await res
        .update('name', {
          name: 'remove',
          target: '',
        })
        .then(() => {
          expect(false).to.equal(true);
        })
        .catch((error) => {
          expect(error.message).to.equal(
            'Cannot do operation remove on scalar value',
          );
        });
    });
    it('update card type - add element to alwaysVisibleFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/updateAlwaysVisible'),
      );
      await res.createCardType('decision/workflows/decision');
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);
      await res.update('alwaysVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/newOne',
      });
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(1);
    });
    it('update card type - remove element from alwaysVisibleFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/updateAlwaysVisible'),
      );
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(1);
      await res.update('alwaysVisibleFields', {
        name: 'remove',
        target: 'decision/fieldTypes/newOne',
      });
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);
    });
    it('update card type - add two elements to alwaysVisibleFields and move the latter to first', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/updateAlwaysVisible'),
      );
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);
      await res.update('alwaysVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/newOne',
      });
      await res.update('alwaysVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/secondNewOne',
      });
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(2);
      await res.update('alwaysVisibleFields', {
        name: 'rank',
        target: 'decision/fieldTypes/secondNewOne',
        newIndex: 0,
      });
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(2);
      expect((res.data as CardType).alwaysVisibleFields.at(0)).to.equal(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update card type - add element to optionallyVisibleFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/optionallyVisible'),
      );
      await res.createCardType('decision/workflows/decision');
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(0);
      await res.update('optionallyVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/newOne',
      });
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(1);
    });
    it('update card type - remove element from optionallyVisibleFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/optionallyVisible'),
      );
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(1);
      await res.update('optionallyVisibleFields', {
        name: 'remove',
        target: 'decision/fieldTypes/newOne',
      });
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(0);
    });
    it('update card type - add two elements to optionallyVisibleFields and move the latter to first', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/optionallyVisible'),
      );
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(0);
      await res.update('optionallyVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/newOne',
      });
      await res.update('optionallyVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/secondNewOne',
      });
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(2);
      await res.update('optionallyVisibleFields', {
        name: 'rank',
        target: 'decision/fieldTypes/secondNewOne',
        newIndex: 0,
      });
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(2);
      expect((res.data as CardType).optionallyVisibleFields.at(0)).to.equal(
        'decision/fieldTypes/secondNewOne',
      );
    });
    it('update card type - workflow', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/updateWorkflow'),
      );
      await res.createCardType('decision/workflows/decision');
      await res.update('workflow', {
        name: 'change',
        target: '',
        to: 'decision/cardTypes/afterUpdate',
      });
      expect((res.data as CardType).workflow).to.equal(
        'decision/cardTypes/afterUpdate',
      );
    });
    it('update card type - add element to customFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/customFields'),
      );
      await res.createCardType('decision/workflows/decision');
      expect((res.data as CardType).customFields.length).to.equal(0);
      await res.update('customFields', {
        name: 'add',
        target: { name: 'decision/fieldTypes/newOne' },
      });
      expect((res.data as CardType).customFields.length).to.equal(1);
    });
    it('update card type - remove element from customFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/customFields'),
      );
      // First add the to-be-removed field to optionally and always visible fields.
      // todo: probably couldn't really exist in both arrays?
      await res.update('optionallyVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/newOne',
      });
      await res.update('alwaysVisibleFields', {
        name: 'add',
        target: 'decision/fieldTypes/newOne',
      });
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(1);
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(1);
      await res.update('customFields', {
        name: 'remove',
        target: { name: 'decision/fieldTypes/newOne' },
      });
      expect((res.data as CardType).customFields.length).to.equal(0);
      expect((res.data as CardType).optionallyVisibleFields.length).to.equal(0);
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);
    });
    it('update card type - add two elements to customFields, then move last one to first', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/customFields'),
      );
      expect((res.data as CardType).customFields.length).to.equal(0);
      await res.update('customFields', {
        name: 'add',
        target: { name: 'decision/fieldTypes/newOne' },
      });
      await res.update('customFields', {
        name: 'add',
        target: { name: 'decision/fieldTypes/newSecondOne' },
      });
      await res.update('customFields', {
        name: 'rank',
        target: { name: 'decision/fieldTypes/newSecondOne' },
        newIndex: 0,
      });
      expect((res.data as CardType).customFields.length).to.equal(2);
      const first = (res.data as CardType).customFields.at(0);
      expect((first as CustomField)?.name).to.equal(
        'decision/fieldTypes/newSecondOne',
      );
    });
    it('update field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/dateFieldType'),
      );
      await res.createFieldType('dateTime');
      await res.update('name', {
        name: 'change',
        target: '',
        to: 'decision/fieldTypes/afterUpdate',
      });
      expect(res.data?.name).to.equal('decision/fieldTypes/afterUpdate');
    });
    it('try to update field type with invalid name', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/dateFieldType'),
      );
      await res.createFieldType('dateTime');
      await res
        .update('name', {
          name: 'change',
          target: '',
          to: 'decision/fieldTypes/afterUpdate-öööö',
        })
        .then(() => {
          expect(false).to.equal(true);
        })
        .catch((error) => {
          expect(error.message).to.include(
            'Resource identifier must follow naming rules.',
          );
        });
    });
    it('update field type - change data type (number -> integer)', async () => {
      let card6 = await project.cardDetailsById('decision_6', {
        metadata: true,
      });
      if (card6 && card6.metadata) {
        expect(card6.metadata['decision/fieldTypes/numberOfCommits']).equals(
          1.5,
        );
      } else {
        expect(false).equals(true);
      }
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/numberOfCommits'),
      );
      await res.update('dataType', {
        name: 'change',
        target: '',
        to: 'integer',
      });
      expect((res.data as FieldType).dataType).to.equal('integer');
      card6 = await project.cardDetailsById('decision_6', {
        metadata: true,
      });
      // Since data type was changed from number to integer, value has changed from 1.5 -> 1
      if (card6 && card6.metadata) {
        expect(card6.metadata['decision/fieldTypes/numberOfCommits']).equals(1);
      } else {
        expect(false).equals(true);
      }
    });
    it('update field type - change displayName and fieldDescription', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/dateFieldType'),
      );
      await res.update('displayName', {
        name: 'change',
        target: '',
        to: 'Field for dates',
      });
      await res.update('fieldDescription', {
        name: 'change',
        target: '',
        to: 'Field description',
      });
      expect((res.data as FieldType).displayName).to.equal('Field for dates');
      expect((res.data as FieldType).fieldDescription).to.equal(
        'Field description',
      );
    });
    it('update field type - change enumValues', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/enumFieldType'),
      );
      await res.createFieldType('enum');
      await res.update<EnumDefinition>('enumValues', {
        name: 'change',
        to: {
          enumValue: 'yes',
          enumDescription: 'Definitely a yes',
          enumDisplayValue: 'YES',
        },
        target: {
          enumValue: 'value1',
        },
      });
      await res.update<EnumDefinition>('enumValues', {
        name: 'change',
        to: {
          enumValue: 'no',
          enumDescription: 'Absolutely not',
          enumDisplayValue: 'NO',
        },
        target: {
          enumValue: 'value2',
        },
      });
      const enums = (res.data as FieldType).enumValues;
      expect(enums?.length).to.equal(2);
      expect(enums?.at(0)?.enumValue).to.equal('yes');
      expect(enums?.at(1)?.enumValue).to.equal('no');
    });
    it('update link type scalar values', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newLinkType'),
      );
      await res.create();
      await res.update<boolean>('enableLinkDescription', {
        name: 'change',
        target: false,
        to: true,
      });
      await res.update('inboundDisplayName', {
        name: 'change',
        target: '',
        to: 'inbound',
      });
      await res.update('outboundDisplayName', {
        name: 'change',
        target: '',
        to: 'outbound',
      });
      const data = res.data as LinkType;
      expect(data.inboundDisplayName).to.equal('inbound');
      expect(data.outboundDisplayName).to.equal('outbound');
      expect(data.enableLinkDescription).to.equal(true);
    });
    it('update graph model scalar values', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newGraphModel'),
      );
      await res.create();
      await res.update('displayName', {
        name: 'change',
        target: '',
        to: 'updated',
      });
      await res.update('description', {
        name: 'change',
        target: '',
        to: 'updated',
      });
      await res.update('category', {
        name: 'change',
        target: '',
        to: 'updated',
      });
      const data = res.data as GraphModel;
      expect(data.displayName).to.equal('updated');
      expect(data.description).to.equal('updated');
      expect(data.category).to.equal('updated');
    });
    it('update graph view scalar values', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newGraphView'),
      );
      await res.create();
      await res.update('displayName', {
        name: 'change',
        target: '',
        to: 'updated',
      });
      await res.update('description', {
        name: 'change',
        target: '',
        to: 'updated',
      });
      await res.update('category', {
        name: 'change',
        target: '',
        to: 'updated',
      });
      const data = res.data as GraphView;
      expect(data.displayName).to.equal('updated');
      expect(data.description).to.equal('updated');
      expect(data.category).to.equal('updated');
    });
    it('update link type arrays', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newLT'),
      );
      await res.update('sourceCardTypes', {
        name: 'add',
        target: 'CT1',
      });
      await res.update('destinationCardTypes', {
        name: 'add',
        target: 'CT1',
      });
      await res.update('sourceCardTypes', {
        name: 'change',
        target: 'CT1',
        to: 'CT1NEW',
      });
      await res.update('destinationCardTypes', {
        name: 'change',
        target: 'CT1',
        to: 'CT1NEW',
      });
      const data = res.data as LinkType;
      expect(data.sourceCardTypes).to.include('CT1NEW');
      expect(data.destinationCardTypes).to.include('CT1NEW');
    });
    it('update report scalar values', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/newREP'),
      );
      await res.update('description', {
        name: 'change',
        target: '',
        to: 'Updated description',
      });
      await res.update('displayName', {
        name: 'change',
        target: '',
        to: 'Updated display name',
      });
      await res.update('category', {
        name: 'change',
        target: '',
        to: 'Updated category',
      });
      const data = res.data as ReportMetadata;
      expect(data.description).to.include('Updated');
      expect(data.displayName).to.include('Updated');
      expect(data.category).to.include('Updated');
    });
    it('update template scalar values', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/newTEMP'),
      );
      await res.update('description', {
        name: 'change',
        target: '',
        to: 'Updated description',
      });
      await res.update('displayName', {
        name: 'change',
        target: '',
        to: 'Updated display name',
      });
      await res.update('category', {
        name: 'change',
        target: '',
        to: 'Updated category',
      });
      const data = res.data as TemplateMetadata;
      expect(data.description).to.include('Updated');
      expect(data.displayName).to.include('Updated');
      expect(data.category).to.include('Updated');
    });
    it('update workflow - rename state', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const expectedItem = { name: 'Deprecated', category: 'closed' };
      const updatedItem = { name: 'ReallyDeprecated', category: 'closed' };
      let found = (res.data as Workflow).states.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update('states', op);
      found = (res.data as Workflow).states.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).to.equal(undefined);
      found = (res.data as Workflow).states.find(
        (item) => item.name === updatedItem.name,
      );
      expect(found).not.to.equal(undefined);
    });
    it('update workflow - rename transition', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const expectedItem = {
        name: 'Approve',
        fromState: ['Draft'],
        toState: 'Approved',
      };
      const updatedItem = {
        name: 'RemoveDraftStatus',
        fromState: ['Draft'],
        toState: 'Approved',
      };
      let found = (res.data as Workflow).transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update('transitions', op);
      found = (res.data as Workflow).transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).to.equal(undefined);
      found = (res.data as Workflow).transitions.find(
        (item) => item.name === updatedItem.name,
      );
      expect(found).not.to.equal(undefined);
    });
    it('update workflow - add state', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const newState = { name: 'OrphanState', category: 'closed' };
      let found = (res.data as Workflow).states.find(
        (item) => item.name === newState.name,
      );
      expect(found).to.equal(undefined);
      const op = {
        name: 'add',
        target: newState,
      } as AddOperation<WorkflowState>;
      await res.update('states', op);
      found = (res.data as Workflow).states.find(
        (item) => item.name === newState.name,
      );
      expect(found).to.not.equal(undefined);
    });
    it('update workflow - add transition', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const newTransition = {
        name: 'Orphaned',
        fromState: ['*'],
        toState: 'OrphanState',
      };
      let found = (res.data as Workflow).transitions.find(
        (item) => item.name === newTransition.name,
      );
      expect(found).to.equal(undefined);
      const op = {
        name: 'add',
        target: newTransition,
      } as AddOperation<WorkflowState>;
      await res.update('transitions', op);
      found = (res.data as Workflow).transitions.find(
        (item) => item.name === newTransition.name,
      );
      expect(found).to.not.equal(undefined);
    });
    it('update workflow - remove state', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const expectedItem = { name: 'ReallyDeprecated', category: 'closed' };
      let found = (res.data as Workflow).states.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'remove',
        target: expectedItem,
      } as RemoveOperation<WorkflowState>;
      await res.update('states', op);
      found = (res.data as Workflow).states.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).to.equal(undefined);
    });
    it('update workflow - remove transition', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const expectedItem = {
        name: 'RemoveDraftStatus',
        fromState: ['Draft'],
        toState: 'Approved',
      };
      let found = (res.data as Workflow).transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).not.to.equal(undefined);
      const op = {
        name: 'remove',
        target: expectedItem,
      } as RemoveOperation<WorkflowTransition>;
      await res.update('transitions', op);
      found = (res.data as Workflow).transitions.find(
        (item) => item.name === expectedItem.name,
      );
      expect(found).to.equal(undefined);
    });
    // Note that the delete operations depend on previously created and updated data.
    it('delete card type', async () => {
      const name = 'decision/cardTypes/newCT';
      const res = new CardTypeResource(project, resourceName(name));
      const before = await project.cardTypes();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.workflows();
      found = after.find((item) => item.name === name);
    });
    it('delete field type', async () => {
      const name = 'decision/fieldTypes/newFT';
      const res = new FieldTypeResource(project, resourceName(name));
      const before = await project.fieldTypes();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.fieldTypes();
      found = after.find((item) => item.name === name);
    });
    it('delete graph model', async () => {
      const name = 'decision/graphModels/newGM';
      const res = new GraphModelResource(project, resourceName(name));
      const before = await project.graphModels();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.graphModels();
      found = after.find((item) => item.name === name);
    });
    it('delete graph view', async () => {
      const name = 'decision/graphViews/newGV';
      const res = new GraphViewResource(project, resourceName(name));
      const before = await project.graphViews();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.graphViews();
      found = after.find((item) => item.name === name);
    });
    it('delete link type', async () => {
      const name = 'decision/linkTypes/newLT';
      const res = new LinkTypeResource(project, resourceName(name));
      const before = await project.linkTypes();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.linkTypes();
      found = after.find((item) => item.name === name);
    });
    it('delete report', async () => {
      const name = 'decision/reports/newREP';
      const res = new ReportResource(project, resourceName(name));
      const before = await project.reports();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.workflows();
      found = after.find((item) => item.name === name);
      expect(found).to.equal(undefined);
    });
    it('delete template', async () => {
      const name = 'decision/templates/newTEMP';
      const res = new TemplateResource(project, resourceName(name));
      const before = await project.templates();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.templates();
      found = after.find((item) => item.name === name);
      expect(found).to.equal(undefined);
    });
    it('delete workflow', async () => {
      const name = 'decision/workflows/newWF';
      const res = new WorkflowResource(project, resourceName(name));
      const before = await project.workflows();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.workflows();
      found = after.find((item) => item.name === name);
      expect(found).to.equal(undefined);
    });
    it('try to delete card type that does not exist', async () => {
      const name = 'decision/cardTypes/nonExisting';
      const res = new CardTypeResource(project, resourceName(name));
      const before = await project.cardTypes();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to delete field type that does not exist', async () => {
      const name = 'decision/fieldTypes/nonExisting';
      const res = new FieldTypeResource(project, resourceName(name));
      const before = await project.fieldTypes();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to delete graph model that does not exist', async () => {
      const name = 'decision/graphModels/nonExisting';
      const res = new GraphModelResource(project, resourceName(name));
      const before = await project.graphModels();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to delete graph view that does not exist', async () => {
      const name = 'decision/graphViews/nonExisting';
      const res = new GraphModelResource(project, resourceName(name));
      const before = await project.graphViews();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to delete link type that does not exist', async () => {
      const name = 'decision/linkTypes/nonExisting';
      const res = new LinkTypeResource(project, resourceName(name));
      const before = await project.linkTypes();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to delete report that does not exist', async () => {
      const name = 'decision/reports/nonExisting';
      const res = new ReportResource(project, resourceName(name));
      const before = await project.reports();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to delete template that does not exist', async () => {
      const name = 'decision/templates/nonExisting';
      const res = new TemplateResource(project, resourceName(name));
      const before = await project.templates();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to delete workflow that does not exist', async () => {
      const name = 'decision/workflows/nonExisting';
      const res = new WorkflowResource(project, resourceName(name));
      const before = await project.workflows();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('try to check usage of nonExisting resource', async () => {
      const name = 'decision/workflows/nonExisting';
      const res = new WorkflowResource(project, resourceName(name));
      const before = await project.workflows();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await res
        .usage()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExisting' does not exist in the project`,
          ),
        );
    });
    it('check usage of cardType resource', async () => {
      const name = 'decision/cardTypes/decision';
      const res = new CardTypeResource(project, resourceName(name));
      await res.usage().then((references) => {
        expect(references).to.include('decision_1');
        expect(references).to.include('decision_6');
        expect(references).to.include('decision/linkTypes/testTypes');
      });
    });
    it('check usage of fieldType resource', async () => {
      const name = 'decision/fieldTypes/finished';
      const res = new FieldTypeResource(project, resourceName(name));
      await res
        .usage()
        .then((references) =>
          expect(references).to.include('decision/cardTypes/decision'),
        );
    });
    it('check usage of graphModel resource', async () => {
      const name = 'decision/graphModels/test';
      const res = new GraphModelResource(project, resourceName(name));
      await res
        .usage()
        .then((references) => expect(references.length).to.equal(0));
    });
    it('check usage of graphView resource', async () => {
      const name = 'decision/graphViews/test';
      const res = new GraphViewResource(project, resourceName(name));
      await res
        .usage()
        .then((references) => expect(references.length).to.equal(0));
    });
    it('check usage of linkType resource', async () => {
      const name = 'decision/linkTypes/test';
      const res = new LinkTypeResource(project, resourceName(name));
      await res
        .usage()
        .then((references) => expect(references.length).to.equal(0)); // no references to this linkType
    });
    it('check usage of report resource', async () => {
      const name = 'decision/reports/testReport';
      const res = new ReportResource(project, resourceName(name));
      await res
        .usage()
        .then((references) => expect(references).to.include('decision_5'));
    });
    it('check usage of template resource', async () => {
      const name = 'decision/templates/simplepage';
      const res = new TemplateResource(project, resourceName(name));
      await res
        .usage()
        .then((references) => expect(references).to.include('decision_5'));
    });
    it('check usage of workflow resource', async () => {
      const name = 'decision/workflows/decision';
      const res = new WorkflowResource(project, resourceName(name));
      await res
        .usage()
        .then((references) =>
          expect(references).to.include('decision/cardTypes/decision'),
        );
    });
  });
});
