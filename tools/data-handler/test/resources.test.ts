// testing
import { expect } from 'chai';

// node
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';

import { Create, Import, Remove } from '../src/commands/index.js';
import { Project } from '../src/containers/project.js';
import { ResourceCollector } from '../src/containers/project/resource-collector.js';
import { resourceName } from '../src/utils/resource-utils.js';
import type {
  RemovableResourceTypes,
  ResourceFolderType,
} from '../src/interfaces/project-interfaces.js';

import { CalculationResource } from '../src/resources/calculation-resource.js';
import { CardTypeResource } from '../src/resources/card-type-resource.js';
import { FieldTypeResource } from '../src/resources/field-type-resource.js';
import { GraphModelResource } from '../src/resources/graph-model-resource.js';
import { GraphViewResource } from '../src/resources/graph-view-resource.js';
import { LinkTypeResource } from '../src/resources/link-type-resource.js';
import { ReportResource } from '../src/resources/report-resource.js';
import { TemplateResource } from '../src/resources/template-resource.js';
import { WorkflowResource } from '../src/resources/workflow-resource.js';

import type {
  CalculationMetadata,
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

describe('resources', function () {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-resource-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  const minimalPath = join(testDir, 'valid/minimal');
  let project: Project;

  // Some of the commands are used in testing.
  let createCmd: Create;
  let importCmd: Import;
  let removeCmd: Remove;

  this.timeout(10000);

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(decisionRecordsPath);
    createCmd = new Create(project);
    importCmd = new Import(project, createCmd);
    removeCmd = new Remove(project);
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
        collector.collectLocalResources();
        exists = await collector.resourceExists(resourceType, nameForResource);
        expect(exists).to.equal(false);
      }

      await checkResource('graphModels');
      await checkResource('graphViews');
      await checkResource('reports');
      await checkResource('templates');
    });
  });

  describe('resource basic operations', () => {
    const baseDir = import.meta.dirname;
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
        displayName: name,
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
        displayName: name,
        inboundDisplayName: 'in',
        outboundDisplayName: 'out',
        destinationCardTypes: ['decision/cardTypes/decision'],
        sourceCardTypes: ['decision/cardTypes/decision'],
      } as LinkType;
      await expect(res.create(linkTypeData)).to.be.rejectedWith(
        `Invalid content JSON: Schema '/linkTypeSchema' validation Error: requires property "enableLinkDescription"`,
      );
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
      await expect(res.create(templateData)).to.be.rejectedWith(
        `Invalid content JSON: Schema '/templateSchema' validation Error: requires property "name"`,
      );
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
        displayName: name,
        states: [],
        transitions: [],
      } as Workflow;
      await res.create(workflowData);
      const after = await project.workflows();
      found = after.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('create calculation', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/newCALC'),
      );
      const before = await project.calculations();
      let found = before.find(
        (item) => item.name === 'decision/calculations/newCALC',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.calculations();
      found = after.find((item) => item.name === res.data.name);
      expect(found).to.not.equal(undefined);
    });
    it('create calculation with provided content', async () => {
      const name = 'decision/calculations/newCALCWithContent';
      const res = new CalculationResource(project, resourceName(name));
      const before = await project.calculations();
      let found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      const calculationData = {
        name: name,
        displayName: 'Test calculation with content',
        description: 'A test calculation for unit tests',
        calculation: '% Custom calculation content\ntest_rule(X) :- fact(X).',
      } as CalculationMetadata;
      await res.create(calculationData);
      const after = await project.calculations();
      found = after.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
    });
    it('try to create calculation with invalid provided content', async () => {
      const name = 'decision/calculations/invalidCALCWithContent';
      const res = new CalculationResource(project, resourceName(name));
      const before = await project.calculations();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      const calculationData = {
        // missing name
        displayName: 'Test calculation with content',
        description: 'A test calculation for unit tests',
        calculation: 'test_rule(X) :- fact(X).',
      } as CalculationMetadata;
      await expect(res.create(calculationData)).to.be.rejectedWith(
        `Invalid content JSON: Schema '/calculationSchema' validation Error: requires property "name"`,
      );
    });
    it('try to create card type with invalid name', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/new-ööö'),
      );
      await expect(
        res.createCardType('decision/workflows/decision'),
      ).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
      );
    });
    it('try to create field type with invalid name', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/new-ööö'),
      );
      await expect(res.createFieldType('shortText')).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
      );
    });
    it('try to create link type with invalid name', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/new-ööö'),
      );
      await expect(res.create()).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
      );
    });
    it('try to create graph model with invalid name', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newÄ'),
      );
      await expect(res.create()).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'newÄ' is invalid",
      );
    });
    it('try to create graph view with invalid name', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newÖ'),
      );
      await expect(res.create()).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'newÖ' is invalid",
      );
    });
    it('try to create report with invalid name', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/new-ööö'),
      );
      await expect(res.createReport()).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
      );
    });
    it('try to create template with invalid name', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/new-ööö'),
      );
      await expect(res.create()).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
      );
    });
    it('try to create workflow with invalid name', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/new-ööö'),
      );
      await expect(res.create()).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
      );
    });
    it('try to create calculation with invalid name', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/new-ööö'),
      );
      await expect(res.create()).to.be.rejectedWith(
        "Resource identifier must follow naming rules. Identifier 'new-ööö' is invalid",
      );
    });
    it('try to create card type with invalid type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/workflows/new-one'),
      );
      await expect(
        res.createCardType('decision/workflows/decision'),
      ).to.be.rejectedWith(
        "Resource name must match the resource type. Type 'workflows' does not match 'cardTypes'",
      );
    });
    it('try to create field type with invalid type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/workflows/new-one'), // cannot create from workflows
      );
      await expect(res.createFieldType('shortText')).to.be.rejectedWith(
        "Resource name must match the resource type. Type 'workflows' does not match 'fieldTypes'",
      );
    });
    it('try to create field type with invalid type', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/workflows/new-one'), // cannot create from workflows
      );
      await expect(res.createReport()).to.be.rejectedWith(
        "Resource name must match the resource type. Type 'workflows' does not match 'reports'",
      );
    });
    it('try to create resources with invalid types', async () => {
      const resources = [
        // cannot create any of these with 'cardTypes' in name
        new CalculationResource(
          project,
          resourceName('decision/cardTypes/new-one'),
        ),
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
        await expect(res.create()).to.be.rejectedWith(
          "Resource name must match the resource type. Type 'cardTypes' does not match",
        );
      }
    });
    it('try to create card type with invalid project prefix', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('unknown/cardTypes/new-one'),
      );
      await expect(
        res.createCardType('decision/workflows/decision'),
      ).to.be.rejectedWith(
        "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
      );
    });
    it('try to create field type with invalid project prefix', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('unknown/fieldTypes/new-one'),
      );
      await expect(res.createFieldType('shortText')).to.be.rejectedWith(
        "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
      );
    });
    it('try to create resources with invalid project prefix', async () => {
      // Include only resources that can be created with call to 'create()'
      const resources = [
        new CalculationResource(
          project,
          resourceName('unknown/calculations/new-one'),
        ),
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
        await expect(res.create()).to.be.rejectedWith(
          "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
        );
      }
    });
    it('try to create report with invalid project prefix', async () => {
      const res = new ReportResource(
        project,
        resourceName('unknown/reports/new-one'),
      );
      await expect(res.createReport()).to.be.rejectedWith(
        "Resource name can only refer to project that it is part of. Prefix 'unknown' is not included in '[decision]'",
      );
    });
    it('try to create card type with invalid content', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/new-one'),
      );
      await expect(
        res.createCardType('decision/workflows/does-not-exist'),
      ).to.be.rejectedWith(
        "Workflow 'decision/workflows/does-not-exist' does not exist in the project",
      );
    });
    it('data of card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newCT'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/cardTypes/newCT',
        displayName: '',
        workflow: 'decision/workflows/decision',
        customFields: [],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      });
    });
    it('data of field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newFT'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/fieldTypes/newFT',
        displayName: '',
        dataType: 'shortText',
      });
    });
    it('data of graph model', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newGM'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/graphModels/newGM',
        displayName: '',
      });
    });
    it('data of graph view', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newGV'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/graphViews/newGV',
        displayName: '',
      });
    });
    it('data of link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newLT'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/linkTypes/newLT',
        displayName: '',
        outboundDisplayName: 'decision/linkTypes/newLT',
        inboundDisplayName: 'decision/linkTypes/newLT',
        sourceCardTypes: [],
        destinationCardTypes: [],
        enableLinkDescription: false,
      });
    });
    it('data of report', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/newREP'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/reports/newREP',
        displayName: '',
        category: 'Uncategorised report',
      });
    });
    it('data of template', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/newTEMP'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/templates/newTEMP',
        displayName: '',
      });
    });
    it('data of workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/workflows/newWF',
        displayName: '',
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
      });
    });
    it('data of calculation', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/newCALC'),
      );
      expect(res.data).to.deep.equal({
        name: 'decision/calculations/newCALC',
        displayName: '',
        description: undefined,
      });
    });
    // Show is basically same as '.data' - it just has extra validation.
    it('show card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newCT'),
      );
      const data = await res.show();
      expect(data).to.deep.equal({
        name: 'decision/cardTypes/newCT',
        displayName: '',
        workflow: 'decision/workflows/decision',
        customFields: [],
        alwaysVisibleFields: [],
        optionallyVisibleFields: [],
      });
    });
    it('show field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newFT'),
      );
      const data = await res.show();
      expect(data).to.deep.equal({
        name: 'decision/fieldTypes/newFT',
        displayName: '',
        dataType: 'shortText',
      });
    });
    it('show graph model', async () => {
      const res = new GraphModelResource(
        project,
        resourceName('decision/graphModels/newGM'),
      );
      const data = await res.show();
      expect(data).to.deep.equal({
        name: 'decision/graphModels/newGM',
        displayName: '',
        calculationFile: 'model.lp',
      });
    });
    it('show graph view', async () => {
      const res = new GraphViewResource(
        project,
        resourceName('decision/graphViews/newGV'),
      );
      const data = await res.show();
      expect(data).to.deep.equal({
        name: 'decision/graphViews/newGV',
        displayName: '',
        handleBarFile: 'view.lp.hbs',
      });
    });
    it('show link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newLT'),
      );
      const data = await res.show();
      expect(data).to.deep.equal({
        name: 'decision/linkTypes/newLT',
        displayName: '',
        outboundDisplayName: 'decision/linkTypes/newLT',
        inboundDisplayName: 'decision/linkTypes/newLT',
        sourceCardTypes: [],
        destinationCardTypes: [],
        enableLinkDescription: false,
      });
    });
    it('show report', async () => {
      const res = new ReportResource(
        project,
        resourceName('decision/reports/newREP'),
      );
      const data = await res.show();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { contentTemplate, queryTemplate, ...others } = data;
      expect(others).to.deep.equal({
        description: undefined,
        name: 'decision/reports/newREP',
        displayName: '',
        metadata: {
          name: 'decision/reports/newREP',
          displayName: '',
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
      });
    });
    it('show calculation', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/newCALC'),
      );
      const data = await res.show();
      expect(data).to.have.property('name', 'decision/calculations/newCALC');
      expect(data).to.have.property('displayName', '');
      expect(data).to.have.property('calculation');
      expect(data.calculation).to.include('newCALC');
    });
    // Tests that report data can be shown from a module; ensures that
    // all report files are reachable; even if their content is not validated.
    it('show imported report', async () => {
      const projectMini = new Project(minimalPath);
      const createCmdMini = new Create(projectMini);
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
      expect(others).to.deep.equal({
        name: 'decision/reports/newREP',
        description: undefined,
        displayName: '',
        metadata: {
          name: 'decision/reports/newREP',
          displayName: '',
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
      });
    });

    it('show template', async () => {
      const res = new TemplateResource(
        project,
        resourceName('decision/templates/newTEMP'),
      );
      const data = await res.show();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { path, ...others } = data;
      expect(others).to.deep.equal({
        description: undefined,
        metadata: {
          name: 'decision/templates/newTEMP',
          displayName: '',
        },
        name: 'decision/templates/newTEMP',
        displayName: '',
        numberOfCards: 0,
      });
    });
    it('show workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      const data = await res.show();
      expect(data).to.deep.equal({
        name: 'decision/workflows/newWF',
        displayName: '',
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
      });
    });
    it('validate resources', async () => {
      const resources = [
        new CalculationResource(
          project,
          resourceName('decision/calculations/newCALC'),
        ),
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
        await expect(resource.validate()).to.not.be.rejected;
      }
    });
    it('try to validate missing resource types', async () => {
      const resources = [
        new CalculationResource(
          project,
          resourceName('decision/calculations/i-do-not-exist'),
        ),
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
        await expect(resource.validate()).to.be.rejected;
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
    it('rename calculation', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/calculations/newname'));
      expect(res.data.name).equals('decision/calculations/newname');
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
      await expect(
        res.rename(resourceName('newpre/workflows/newname')),
      ).to.be.rejectedWith('Can only rename project resources');
      await res.delete();
    });
    it('try to rename workflow - attempt to change type', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await expect(
        res.rename(resourceName('decision/linkTypes/newname')),
      ).to.be.rejectedWith('Cannot change resource type');
      await res.delete();
    });
    it('try to rename workflow - attempt to use invalid name', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await expect(
        res.rename(resourceName('decision/workflows/newname-ööö')),
      ).to.be.rejectedWith('Resource identifier must follow naming');
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
      await expect(
        res.update('name', {
          name: 'rank',
          target: '',
          newIndex: 99,
        }),
      ).to.be.rejectedWith('Cannot do operation rank on scalar value');
    });
    it('update card type - try to "add" scalar "name"', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/tryForUpdate'),
      );
      await expect(
        res.update('name', {
          name: 'add',
          target: '',
        }),
      ).to.be.rejectedWith('Cannot do operation add on scalar value');
    });
    it('update card type - try to "remove" scalar "name"', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/tryForUpdate'),
      );
      await expect(
        res.update('name', {
          name: 'remove',
          target: '',
        }),
      ).to.be.rejectedWith('Cannot do operation remove on scalar value');
    });
    it('update card type - add element to alwaysVisibleFields', async () => {
      // Create field type to add first
      const newFieldType = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newOne'),
      );
      await newFieldType.createFieldType('shortText');

      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/updateAlwaysVisible'),
      );
      await res.createCardType('decision/workflows/decision');
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);

      // Add the field type to the custom fields
      await res.update('customFields', {
        name: 'add',
        target: { name: 'decision/fieldTypes/newOne' },
      });

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
      // Create second field type to add (first one is already created)
      const secondNewFieldType = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/secondNewOne'),
      );
      await secondNewFieldType.createFieldType('shortText');

      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/updateAlwaysVisible'),
      );
      expect((res.data as CardType).alwaysVisibleFields.length).to.equal(0);

      // Add the field types to the card type
      // Add the field type to the custom fields
      await res.update('customFields', {
        name: 'add',
        target: { name: 'decision/fieldTypes/secondNewOne' },
      });

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

      // Add custom field to the card type first
      await res.update('customFields', {
        name: 'add',
        target: { name: 'decision/fieldTypes/newOne' },
      });

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

      // Add second field type to the custom fields
      await res.update('customFields', {
        name: 'add',
        target: { name: 'decision/fieldTypes/secondNewOne' },
      });

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
    it('update card type - try to add non-existing element to customFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/checkNonExistingItems'),
      );
      await res.createCardType('decision/workflows/decision');
      expect((res.data as CardType).customFields.length).to.equal(0);
      // Adding a field type that does not exist should throw an error
      await expect(
        res.update('customFields', {
          name: 'add',
          target: { name: 'decision/fieldTypes/doesNotExist' },
        }),
      ).to.be.rejected;
    });
    it('update card type - try to add non-existing element to alwaysVisibleFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/checkNonExistingItems'),
      );
      expect((res.data as CardType).customFields.length).to.equal(0);
      // Adding a field type that does not exist should throw an error
      await expect(
        res.update('alwaysVisibleFields', {
          name: 'add',
          target: { name: 'decision/fieldTypes/doesNotExist' },
        }),
      ).to.be.rejected;
      // Also adding a field type that exists, but is not part of custom fields should fail
      await expect(
        res.update('alwaysVisibleFields', {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        }),
      ).to.be.rejected;
    });
    it('update card type - try to add non-existing element to optionallyVisibleFields', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/checkNonExistingItems'),
      );
      expect((res.data as CardType).customFields.length).to.equal(0);
      // Adding a field type that does not exist should throw an error
      await expect(
        res.update('optionallyVisibleFields', {
          name: 'add',
          target: { name: 'decision/fieldTypes/doesNotExist' },
        }),
      ).to.be.rejected;
      // Also adding a field type that exists, but is not part of custom fields should fail
      await expect(
        res.update('optionallyVisibleFields', {
          name: 'add',
          target: { name: 'decision/fieldTypes/newOne' },
        }),
      ).to.be.rejected;
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
        target: { name: 'decision/fieldTypes/secondNewOne' },
      });
      await res.update('customFields', {
        name: 'rank',
        target: { name: 'decision/fieldTypes/secondNewOne' },
        newIndex: 0,
      });
      expect((res.data as CardType).customFields.length).to.equal(2);
      const first = (res.data as CardType).customFields.at(0);
      expect((first as CustomField)?.name).to.equal(
        'decision/fieldTypes/secondNewOne',
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
      await expect(
        res.update('name', {
          name: 'change',
          target: '',
          to: 'decision/fieldTypes/afterUpdate-öööö',
        }),
      ).to.be.rejectedWith('Resource identifier must follow naming rules.');
      // todo: the resource is still renamed, even if validation does not succeed; it should not happen
      //       to avoid issues with other tests, delete the resource
      await res.delete();
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
    it('update field type - change displayName and description', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/dateFieldType'),
      );
      await res.createFieldType('shortText');
      await res.update('displayName', {
        name: 'change',
        target: '',
        to: 'Field for dates',
      });
      await res.update('description', {
        name: 'change',
        target: '',
        to: 'Field description',
      });
      expect((res.data as FieldType).displayName).to.equal('Field for dates');
      expect((res.data as FieldType).description).to.equal('Field description');
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
    it('update calculation scalar values', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/newCALCWithContent'),
      );
      await res.update('displayName', {
        name: 'change',
        target: '',
        to: 'Updated Calculation Display Name',
      });
      await res.update('description', {
        name: 'change',
        target: '',
        to: 'Updated calculation description',
      });
      const data = res.data as CalculationMetadata;
      expect(data.displayName).to.equal('Updated Calculation Display Name');
      expect(data.description).to.equal('Updated calculation description');
    });
    it('update calculation - change calculation content', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/newCALCWithContent'),
      );
      const newCalculationContent =
        '% Updated calculation content\nupdated_rule(X) :- some_fact(X).';
      await res.update('calculation', {
        name: 'change',
        target: '',
        to: newCalculationContent,
      });
      const data = res.data as CalculationMetadata;
      expect(data.calculation).to.equal(newCalculationContent);
    });
    it('update calculation - name', async () => {
      const res = new CalculationResource(
        project,
        resourceName('decision/calculations/calcForRename'),
      );
      await res.create();
      await res.update('name', {
        name: 'change',
        target: '',
        to: 'decision/calculations/afterCalcUpdate',
      });
      expect(res.data?.name).to.equal('decision/calculations/afterCalcUpdate');
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
    it('update existing workflow - rename state', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/decision'),
      );
      const cards = await project.cards(project.paths.cardRootFolder, {
        metadata: true,
      });
      const cardsWithThisWorkflow = cards.filter((card) => {
        const ct = new CardTypeResource(
          project,
          resourceName(card.metadata?.cardType as string),
        );
        if (ct) {
          return ct.data.workflow === 'decision/workflows/decision';
        }
      });
      // Update the workflow state name and check that the cards are updated
      const expectedItem = { name: 'Approved', category: 'closed' };
      const updatedItem = { name: 'ReallyApproved', category: 'closed' };
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update('states', op);

      // Check that card metadata is updated.
      const updatedCard = await project.findSpecificCard(
        cardsWithThisWorkflow.at(0)?.key as string,
        { metadata: true },
      );
      expect(updatedCard?.metadata?.workflowState).to.equal('ReallyApproved');
      // Change the state name back to the original to avoid issues in other tests.
      const opRevert = {
        name: 'change',
        target: updatedItem,
        to: expectedItem,
      } as ChangeOperation<WorkflowState>;
      await res.update('states', opRevert);
    });
    it('try to update existing workflow - rename state with incomplete state', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/decision'),
      );
      const expectedItem = { name: 'Approved', category: 'closed' };
      const updatedItem = { name: 'ReallyApproved' };
      const op = {
        name: 'change',
        target: expectedItem,
        to: updatedItem,
      } as ChangeOperation<WorkflowState>;
      await expect(res.update('states', op)).to.be.rejectedWith(
        "Cannot change state 'Approved' for workflow 'decision/workflows/decision'.",
      );
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
    it('delete calculation', async () => {
      const name = 'decision/calculations/newCALC';
      const res = new CalculationResource(project, resourceName(name));
      const before = await project.calculations();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.calculations();
      found = after.find((item) => item.name === name);
      expect(found).to.equal(undefined);
    });
    it('delete card type', async () => {
      const name = 'decision/cardTypes/newCT';
      const res = new CardTypeResource(project, resourceName(name));
      const before = await project.cardTypes();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.cardTypes();
      found = after.find((item) => item.name === name);
      expect(found).to.equal(undefined);
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
      expect(found).to.equal(undefined);
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
      expect(found).to.equal(undefined);
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
      expect(found).to.equal(undefined);
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
      expect(found).to.equal(undefined);
    });
    it('delete report', async () => {
      const name = 'decision/reports/newREP';
      const res = new ReportResource(project, resourceName(name));
      const before = await project.reports();
      let found = before.find((item) => item.name === name);
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.reports();
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
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete calculation that does not exist', async () => {
      const name = 'decision/calculations/nonExisting';
      const res = new CalculationResource(project, resourceName(name));
      const before = await project.calculations();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete field type that does not exist', async () => {
      const name = 'decision/fieldTypes/nonExisting';
      const res = new FieldTypeResource(project, resourceName(name));
      const before = await project.fieldTypes();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete graph model that does not exist', async () => {
      const name = 'decision/graphModels/nonExisting';
      const res = new GraphModelResource(project, resourceName(name));
      const before = await project.graphModels();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete graph view that does not exist', async () => {
      const name = 'decision/graphViews/nonExisting';
      const res = new GraphModelResource(project, resourceName(name));
      const before = await project.graphViews();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete link type that does not exist', async () => {
      const name = 'decision/linkTypes/nonExisting';
      const res = new LinkTypeResource(project, resourceName(name));
      const before = await project.linkTypes();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete report that does not exist', async () => {
      const name = 'decision/reports/nonExisting';
      const res = new ReportResource(project, resourceName(name));
      const before = await project.reports();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete template that does not exist', async () => {
      const name = 'decision/templates/nonExisting';
      const res = new TemplateResource(project, resourceName(name));
      const before = await project.templates();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to delete workflow that does not exist', async () => {
      const name = 'decision/workflows/nonExisting';
      const res = new WorkflowResource(project, resourceName(name));
      const before = await project.workflows();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.delete()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
      );
    });
    it('try to check usage of nonExisting resource', async () => {
      const name = 'decision/workflows/nonExisting';
      const res = new WorkflowResource(project, resourceName(name));
      const before = await project.workflows();
      const found = before.find((item) => item.name === name);
      expect(found).to.equal(undefined);
      await expect(res.usage()).to.be.rejectedWith(
        `Resource 'nonExisting' does not exist in the project`,
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
    it('check usage of calculation resource', async () => {
      const name = 'decision/calculations/test';
      const res = new CalculationResource(project, resourceName(name));
      const references = await res.usage();
      expect(references.length).to.be.greaterThanOrEqual(0);
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
