// testing
import { expect } from 'chai';

// node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';

import { Calculate } from '../src/calculate.js';
import { Create } from '../src/create.js';
import { Import } from '../src/import.js';
import { Remove } from '../src/remove.js';
import { Validate } from '../src/validate.js';

import { Project } from '../src/containers/project.js';
import { ResourceCollector } from '../src/containers/project/resource-collector.js';
import { resourceName } from '../src/utils/resource-utils.js';
import { RemovableResourceTypes } from '../src/interfaces/project-interfaces.js';

import { WorkflowResource } from '../src/resources/workflow-resource.js';
import { CardTypeResource } from '../src/resources/card-type-resource.js';
import { FieldTypeResource } from '../src/resources/field-type-resource.js';
import { LinkTypeResource } from '../src/resources/link-type-resource.js';

import {
  CardType,
  CustomField,
  EnumDefinition,
  FieldType,
  LinkType,
  Workflow,
  WorkflowState,
  WorkflowTransition,
} from '../src/interfaces/resource-interfaces.js';

import {
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
  const validateCmd = Validate.getInstance();
  let calculateCmd: Calculate;
  let createCmd: Create;
  let importCmd: Import;
  let removeCmd: Remove;

  before(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(decisionRecordsPath);
    calculateCmd = new Calculate(project);
    createCmd = new Create(
      project,
      calculateCmd,
      validateCmd,
      await project.projectPrefixes(),
    );
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
      expect((await collector.resources('linkTypes')).length).to.equal(0);
      expect((await collector.resources('reports')).length).to.equal(0);
      expect((await collector.resources('templates')).length).to.equal(0);
      expect((await collector.resources('workflows')).length).to.equal(0);
      collector.collectLocalResources();

      // After collecting the resources, arrays are populated.
      const calcCount = (await collector.resources('calculations')).length;
      const cardTypesCount = (await collector.resources('cardTypes')).length;
      const fieldTypesCount = (await collector.resources('fieldTypes')).length;
      const linkTypesCount = (await collector.resources('linkTypes')).length;
      const reportsCount = (await collector.resources('reports')).length;
      const templatesCount = (await collector.resources('templates')).length;
      const workflowsCount = (await collector.resources('workflows')).length;

      expect(calcCount).not.to.equal(0);
      expect(cardTypesCount).not.to.equal(0);
      expect(fieldTypesCount).not.to.equal(0);
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
      // Note that minimal project does not have fieldTypes, linkTypes or reports
      collector.collectLocalResources();
      const calcCount = (await collector.resources('calculations')).length;
      const cardTypesCount = (await collector.resources('cardTypes')).length;
      const templatesCount = (await collector.resources('templates')).length;
      const workflowsCount = (await collector.resources('workflows')).length;

      await importCmd.importProject(minimalPath, project.basePath);
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

      // Removing resources automatically updates collector arrays, but only for
      // instance that is owned by the Project (and it is not public).
      // The tested 'collector' instance needs to be updated by calling 'collectLocalResources()'.
      await removeCmd.remove('workflow', nameForWorkflow);
      collector.collectLocalResources();
      exists = await collector.resourceExists('workflows', fileName);
      expect(exists).to.equal(false);
    });

    it('add and remove other file based resources', async () => {
      const collector = new ResourceCollector(project);

      async function checkResource(type: string) {
        const resourceType = type;
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
        const resourceType = type;
        const removeType = resourceType.substring(0, resourceType.length - 1);
        const resourceCount = (await collector.resources(resourceType)).length;
        const nameForResource = `${project.projectPrefix}/${resourceType}/newOne`;

        if (type === 'templates') {
          await createCmd.createTemplate(nameForResource, '');
        } else if (type === 'reports') {
          await createCmd.createReport(nameForResource);
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

      checkResource('templates');
      checkResource('reports');
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
        resourceName('decision/cardTypes/newWF'),
      );
      const before = await project.cardTypes();
      let found = before.find(
        (item) => item.name === 'decision/cardTypes/newWF',
      );
      expect(found).to.equal(undefined);
      await res.createCardType('decision/workflows/decision');
      const after = await project.cardTypes();
      found = after.find((item) => item.name === 'decision/cardTypes/newWF');
      expect(found).to.not.equal(undefined);
    });
    it('create field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF'),
      );
      const before = await project.fieldTypes();
      let found = before.find(
        (item) => item.name === 'decision/fieldTypes/newWF',
      );
      expect(found).to.equal(undefined);
      await res.createFieldType('shortText');
      const after = await project.fieldTypes();
      found = after.find((item) => item.name === 'decision/fieldTypes/newWF');
      expect(found).to.not.equal(undefined);
    });
    it('create link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF'),
      );
      const before = await project.linkTypes();
      let found = before.find(
        (item) => item.name === 'decision/linkTypes/newWF',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.linkTypes();
      found = after.find((item) => item.name === 'decision/linkTypes/newWF');
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
      found = after.find((item) => item.name === 'decision/workflows/newWF');
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
        resourceName('decision/cardTypes/new111'), // names cannot have digits
      );
      await res
        .createCardType('decision/workflows/decision')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new111' is invalid",
            );
          }
        });
    });
    it('try to create field type with invalid name', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/new111'), // names cannot have digits
      );
      await res
        .createFieldType('shortText')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new111' is invalid",
            );
          }
        });
    });
    it('try to create link type with invalid name', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/new111'), // names cannot have digits
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new111' is invalid",
            );
          }
        });
    });
    it('try to create workflow with invalid name', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/new111'), // names cannot have digits
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource identifier must follow naming rules. Identifier 'new111' is invalid",
            );
          }
        });
    });
    it('try to create card type with invalid type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/workflows/new-one'), // cannot create from workflows
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
    it('try to create link type with invalid type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/workflows/new-one'), // cannot create from workflows
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name must match the resource type. Type 'workflows' does not match 'linkTypes'",
            );
          }
        });
    });
    it('try to create workflow with invalid type', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/linkTypes/new-one'), // cannot create from link types
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name must match the resource type. Type 'linkTypes' does not match 'workflows'",
            );
          }
        });
    });
    it('try to create card type with invalid project prefix', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('diipadaapa/cardTypes/new-one'), // cannot create from unknown prefix
      );
      await res
        .createCardType('decision/workflows/decision')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name can only refer to project that it is part of. Prefix 'diipadaapa' is not included in '[decision]'",
            );
          }
        });
    });
    it('try to create field type with invalid project prefix', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('diipadaapa/fieldTypes/new-one'), // cannot create from unknown prefix
      );
      await res
        .createFieldType('shortText')
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name can only refer to project that it is part of. Prefix 'diipadaapa' is not included in '[decision]'",
            );
          }
        });
    });
    it('try to create link type with invalid project prefix', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('diipadaapa/linkTypes/new-one'), // cannot create from unknown prefix
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name can only refer to project that it is part of. Prefix 'diipadaapa' is not included in '[decision]'",
            );
          }
        });
    });
    it('try to create workflow with invalid project prefix', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('diipadaapa/workflows/new-one'), // cannot create from unknown prefix
      );
      await res
        .create()
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Resource name can only refer to project that it is part of. Prefix 'diipadaapa' is not included in '[decision]'",
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
    it('try to create field type with invalid content', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/cardTypes/new-one'),
      );
      await res
        .createFieldType('data-type-that-does-not-exist') // invalid data type
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.equal(
              "Field type 'data-type-that-does-not-exist' not supported. Supported types shortText, longText, number, integer, boolean, enum, list, date, dateTime, person",
            );
          }
        });
    });
    it('data of card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newWF'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/cardTypes/newWF',
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
        resourceName('decision/fieldTypes/newWF'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/fieldTypes/newWF',
          dataType: 'shortText',
        }),
      );
    });
    it('data of link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/linkTypes/newWF',
          outboundDisplayName: 'decision/linkTypes/newWF',
          inboundDisplayName: 'decision/linkTypes/newWF',
          sourceCardTypes: [],
          destinationCardTypes: [],
          enableLinkDescription: false,
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
        resourceName('decision/cardTypes/newWF'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/cardTypes/newWF',
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
        resourceName('decision/fieldTypes/newWF'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/fieldTypes/newWF',
          dataType: 'shortText',
        }),
      );
    });
    it('show link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/linkTypes/newWF',
          outboundDisplayName: 'decision/linkTypes/newWF',
          inboundDisplayName: 'decision/linkTypes/newWF',
          sourceCardTypes: [],
          destinationCardTypes: [],
          enableLinkDescription: false,
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
    it('validate card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newWF'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('validate field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('validate link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('validate workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('try to validate missing card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/i-do-not-exist'),
      );
      await res.validate().catch(() => expect(true).to.equal(true));
    });
    it('try to validate missing field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/i-do-not-exist'),
      );
      await res.validate().catch(() => expect(true).to.equal(true));
    });
    it('try to validate missing link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/i-do-not-exist'),
      );
      await res.validate().catch(() => expect(true).to.equal(true));
    });
    it('try to validate missing workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/i-do-not-exist'),
      );
      await res.validate().catch(() => expect(true).to.equal(true));
    });
    it('rename card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newResForRename'),
      );
      await res.createCardType('decision/workflows/decision');
      await res.rename(resourceName('decision/cardTypes/newname'));
      await res.delete();
    });
    it('rename field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newResForRename'),
      );
      await res.createFieldType('shortText');
      await res.rename(resourceName('decision/fieldTypes/newname'));
      await res.delete();
    });
    it('rename link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/linkTypes/newname'));
      await res.delete();
    });
    it('rename workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await res.rename(resourceName('decision/workflows/newname'));
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
    it('try to rename workflow - attempt to use illegal name', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename'),
      );
      await res.create();
      await res
        .rename(resourceName('decision/workflows/newname111'))
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
      await res.update('customFields', {
        name: 'remove',
        target: { name: 'decision/fieldTypes/newOne' },
      });
      expect((res.data as CardType).customFields.length).to.equal(0);
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
          to: 'decision/fieldTypes/afterUpdate12121212',
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
    // @todo:
    //it('update field type - change data type', async () => {});
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
        resourceName('decision/linkTypes/newLT'),
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
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newWF'),
      );
      const before = await project.cardTypes();
      let found = before.find(
        (item) => item.name === 'decision/cardTypes/newWF',
      );
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.workflows();
      found = after.find((item) => item.name === 'decision/cardTypes/newWF');
    });
    it('delete field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF'),
      );
      const before = await project.fieldTypes();
      let found = before.find(
        (item) => item.name === 'decision/fieldTypes/newWF',
      );
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.fieldTypes();
      found = after.find((item) => item.name === 'decision/fieldTypes/newWF');
    });
    it('delete link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF'),
      );
      const before = await project.linkTypes();
      let found = before.find(
        (item) => item.name === 'decision/linkTypes/newWF',
      );
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.linkTypes();
      found = after.find((item) => item.name === 'decision/linkTypes/newWF');
    });
    it('delete workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF'),
      );
      res.create();
      const before = await project.workflows();
      let found = before.find(
        (item) => item.name === 'decision/workflows/newWF',
      );
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.workflows();
      found = after.find((item) => item.name === 'decision/workflows/newWF');
      expect(found).to.equal(undefined);
    });
    it('try to delete card type that does not exist', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/nonExistingCT'),
      );
      const before = await project.cardTypes();
      const found = before.find(
        (item) => item.name === 'decision/cardTypes/nonExistingCT',
      );
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExistingCT' does not exist in the project`,
          ),
        );
    });
    it('try to delete field type that does not exist', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/nonExistingFT'),
      );
      const before = await project.fieldTypes();
      const found = before.find(
        (item) => item.name === 'decision/fieldTypes/nonExistingFT',
      );
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExistingFT' does not exist in the project`,
          ),
        );
    });
    it('try to delete link type that does not exist', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/nonExistingLT'),
      );
      const before = await project.cardTypes();
      const found = before.find(
        (item) => item.name === 'decision/linkTypes/nonExistingLT',
      );
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExistingLT' does not exist in the project`,
          ),
        );
    });
    it('try to delete workflow that does not exist', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/nonExistingWF'),
      );
      const before = await project.cardTypes();
      const found = before.find(
        (item) => item.name === 'decision/workflows/nonExistingWF',
      );
      expect(found).to.equal(undefined);
      await res
        .delete()
        .then(() => expect(false).to.equal(true))
        .catch((error) =>
          expect(error.message).to.equal(
            `Resource 'nonExistingWF' does not exist in the project`,
          ),
        );
    });
  });
});
