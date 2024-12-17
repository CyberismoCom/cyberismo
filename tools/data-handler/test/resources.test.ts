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
// import {
//   CardType,
//   LinkType,
//   Workflow,
//   WorkflowState,
//   WorkflowTransition,
// } from '../src/interfaces/resource-interfaces.js';

// todo: add to its own test file
import { updateArray } from '../src/utils/common-utils.js';
import { RenameOperation } from '../src/resources/resource-object.js';

describe('resource-collector', () => {
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

  it('collect resources', async () => {
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
    const cardTypesCountAgain = (await collector.resources('cardTypes')).length;
    const fieldTypesCountAgain = (await collector.resources('fieldTypes'))
      .length;
    const linkTypesCountAgain = (await collector.resources('linkTypes')).length;
    const reportsCountAgain = (await collector.resources('reports')).length;
    const templatesCountAgain = (await collector.resources('templates')).length;
    const workflowsCountAgain = (await collector.resources('workflows')).length;

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

  it('collect resources with module', async () => {
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
    const cardTypesCountAgain = (await collector.resources('cardTypes')).length;
    const templatesCountAgain = (await collector.resources('templates')).length;
    const workflowsCountAgain = (await collector.resources('workflows')).length;

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
    const fileName = nameForWorkflow + '.json';

    // Creating new resources automatically updates collector arrays, but only for
    // instance that is owned by the Project. The tested 'collector' instance needs
    // to be updated by calling 'collectLocalResources()'.
    await createCmd.createWorkflow(fileName, '');
    collector.collectLocalResources();
    let exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(true);
    const workflowsCountAgain = (await collector.resources('workflows')).length;
    expect(workflowsCount + 1).to.equal(workflowsCountAgain);

    // Removing resources automatically updates collector arrays, but only for
    // instance that is owned by the Project (and it is not public).
    // The tested 'collector' instance needs to be updated by calling 'collectLocalResources()'.
    await removeCmd.remove('workflow', nameForWorkflow);
    collector.collectLocalResources();
    exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(false);
  });

  it('add and remove file based resources', async () => {
    const collector = new ResourceCollector(project);

    async function checkResource(type: string) {
      const resourceType = type;
      const removeType = resourceType.substring(0, resourceType.length - 1);
      const resourceCount = (await collector.resources(resourceType)).length;
      const nameForResource = `${project.projectPrefix}/${resourceType}/newOne`;
      const fileName = nameForResource + '.json';

      if (type === 'cardTypes') {
        await createCmd.createCardType(fileName, 'decision/workflows/decision');
      } else if (type === 'fieldTypes') {
        await createCmd.createFieldType(fileName, 'shortText');
      } else if (type === 'linkTypes') {
        await createCmd.createLinkType(fileName);
      } else {
        console.error('unhandled type: ' + type);
        expect(false).to.equal(true);
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
        console.error('unhandled type: ' + type);
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

    checkResource('templates');
    checkResource('reports');
  });

  it('UpdateCmd: update folder file resource', async () => {
    const collector = new ResourceCollector(project);
    collector.collectLocalResources();
    const name = `${project.projectPrefix}/workflows/decision`;
    const fileName = `${name}.json`;
    const exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(true);

    const wf = new WorkflowResource(project, resourceName(fileName));
    const newName = `${project.projectPrefix}/workflows/newName`;
    const oldName = wf.data?.name;
    const op = {
      name: 'change',
      from: oldName,
      to: newName,
    } as RenameOperation<string>;
    await wf.update('name', op);
    collector.changed();
    expect(oldName).to.not.equal(wf.data?.name);
    expect(wf.data?.name).to.equal(newName);
  });

  it('UpdateCmd: try to update folder file resource with invalid data', async () => {
    const collector = new ResourceCollector(project);
    collector.collectLocalResources();
    const name = `${project.projectPrefix}/workflows/simple`;
    const fileName = `${name}.json`;
    const exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(true);

    const wf = new WorkflowResource(project, resourceName(fileName));
    const invalidName = `${project.projectPrefix}/workflows/newName111`;
    const op = {
      name: 'change',
      from: wf.data?.name,
      to: invalidName,
    } as RenameOperation<string>;
    await wf
      .update('name', op)
      .then(() => {
        expect(false).to.equal(true);
      })
      .catch((error) => {
        expect(error.message).to.equal(
          "Cannot change 'name' of the resource to 'decision/workflows/newName111'",
        );
      });
  });

  describe('resource base class helpers', () => {
    const baseDir = dirname(fileURLToPath(import.meta.url));
    const testDir = join(baseDir, 'tmp-resource-tests');
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
    it('change plural type name to singular', async () => {
      const types = ['cardtypes', 'fieldtypes', 'linktypes', 'workflows'];
      const expectedTypes = ['cardtype', 'fieldtype', 'linktype', 'workflow'];
      const wf = new WorkflowResource(
        project,
        resourceName('decision/workflows/decision'),
      );
      let index = 0;
      for (const type of types) {
        const singular = wf.singularType(type);
        expect(expectedTypes[index]).to.equal(singular);
        ++index;
      }
    });

    it('replace value in array', async () => {
      const originalArray = ['apples', 'oranges', 'pineapples'];
      // const wf = new WorkflowResource(
      //   project,
      //   resourceName('decision/workflows/decision'),
      // );
      const newArray = updateArray(originalArray, 'oranges', 'mangos');
      expect(newArray).to.include('mangos');
      expect(newArray).not.to.include('oranges');
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
    it('change plural type name to singular', async () => {
      const types = ['cardtypes', 'fieldtypes', 'linktypes', 'workflows'];
      const expectedTypes = ['cardtype', 'fieldtype', 'linktype', 'workflow'];
      const wf = new WorkflowResource(
        project,
        resourceName('decision/workflows/decision'),
      );
      let index = 0;
      for (const type of types) {
        const singular = wf.singularType(type);
        expect(expectedTypes[index]).to.equal(singular);
        ++index;
      }
    });
    // it('calculate', async () => {}); //todo: not implemented yet
    it('create card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newWF.json'),
      );
      const before = await project.cardTypes();
      let found = before.find(
        (item) => item.name === 'decision/cardTypes/newWF.json',
      );
      expect(found).to.equal(undefined);
      await res.createCardType('decision/workflows/decision');
      const after = await project.cardTypes();
      found = after.find(
        (item) => item.name === 'decision/cardTypes/newWF.json',
      );
      expect(found).to.not.equal(undefined);
    });
    it('create field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF.json'),
      );
      const before = await project.fieldTypes();
      let found = before.find(
        (item) => item.name === 'decision/fieldTypes/newWF.json',
      );
      expect(found).to.equal(undefined);
      await res.createFieldType('shortText');
      const after = await project.fieldTypes();
      found = after.find(
        (item) => item.name === 'decision/fieldTypes/newWF.json',
      );
      expect(found).to.not.equal(undefined);
    });
    it('create link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF.json'),
      );
      const before = await project.linkTypes();
      let found = before.find(
        (item) => item.name === 'decision/linkTypes/newWF.json',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.linkTypes();
      found = after.find(
        (item) => item.name === 'decision/linkTypes/newWF.json',
      );
      expect(found).to.not.equal(undefined);
    });
    it('create workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF.json'),
      );
      const before = await project.workflows();
      let found = before.find(
        (item) => item.name === 'decision/workflows/newWF.json',
      );
      expect(found).to.equal(undefined);
      await res.create();
      const after = await project.workflows();
      found = after.find(
        (item) => item.name === 'decision/workflows/newWF.json',
      );
      expect(found).to.not.equal(undefined);
    });
    it('try to create card type with invalid name', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/new111.json'), // names cannot have digits
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
        resourceName('decision/fieldTypes/new111.json'), // names cannot have digits
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
        resourceName('decision/linkTypes/new111.json'), // names cannot have digits
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
        resourceName('decision/workflows/new111.json'), // names cannot have digits
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
        resourceName('decision/linkTypes/new-one.json'), // cannot create from link types
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
        resourceName('diipadaapa/workflows/new-one.json'), // cannot create from unknown prefix
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

    // todo: add tests where linkType and workflow are created with valid content

    it('data of card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newWF.json'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/cardTypes/newWF.json',
          workflow: 'decision/workflows/decision.json',
          customFields: [],
          alwaysVisibleFields: [],
          optionallyVisibleFields: [],
        }),
      );
    });
    it('data of field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF.json'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/fieldTypes/newWF.json',
          dataType: 'shortText',
        }),
      );
    });
    it('data of link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF.json'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/linkTypes/newWF.json',
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
        resourceName('decision/workflows/newWF.json'),
      );
      expect(JSON.stringify(res.data)).to.equal(
        JSON.stringify({
          name: 'decision/workflows/newWF.json',
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
        resourceName('decision/cardTypes/newWF.json'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/cardTypes/newWF.json',
          workflow: 'decision/workflows/decision.json',
          customFields: [],
          alwaysVisibleFields: [],
          optionallyVisibleFields: [],
        }),
      );
    });
    it('show field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF.json'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/fieldTypes/newWF.json',
          dataType: 'shortText',
        }),
      );
    });
    it('show link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF.json'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/linkTypes/newWF.json',
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
        resourceName('decision/workflows/newWF.json'),
      );
      const data = await res.show();
      expect(JSON.stringify(data)).to.equal(
        JSON.stringify({
          name: 'decision/workflows/newWF.json',
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
        resourceName('decision/cardTypes/newWF.json'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('validate field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF.json'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('validate link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF.json'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('validate workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newWF.json'),
      );
      await res.validate().catch(() => expect(false).to.equal(true));
    });
    it('rename card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newResForRename.json'),
      );
      await res.createCardType('decision/workflows/decision');
      project.collectLocalResources();
      await res.rename(resourceName('decision/cardTypes/newname.json'));
      await res.delete();
    });
    it('rename field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newResForRename.json'),
      );
      await res.createFieldType('shortText');
      await res.rename(resourceName('decision/fieldTypes/newname.json'));
      await res.delete();
    });
    it('rename link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newResForRename.json'),
      );
      await res.create();
      project.collectLocalResources();
      await res.rename(resourceName('decision/linkTypes/newname.json'));
      await res.delete();
    });
    it('rename workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename.json'),
      );
      await res.create();
      await res.rename(resourceName('decision/workflows/newname.json'));
      await res.delete();
    });
    it('try to rename workflow - attempt to change prefix', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/newResForRename.json'),
      );
      await res.create();
      await res
        .rename(resourceName('newpre/workflows/newname.json'))
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
        resourceName('decision/workflows/newResForRename.json'),
      );
      await res.create();
      await res
        .rename(resourceName('decision/linkTypes/newname.json'))
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
        resourceName('decision/workflows/newResForRename.json'),
      );
      await res.create();
      await res
        .rename(resourceName('decision/workflows/newname111.json'))
        .then(() => expect(false).to.equal(true))
        .catch((err) => {
          if (err instanceof Error) {
            expect(err.message).to.include(
              "Resource identifier must follow naming rules. Identifier 'newname111' is invalid",
            );
          }
        });
      await res.delete();
    });
    it('update card type', async () => {});
    it('update field type', async () => {});
    it('update link type', async () => {});
    // it('update workflow', async () => {
    //   const res = new WorkflowResource(
    //     project,
    //     resourceName('decision/workflows/newWF.json'),
    //   );
    //   // name
    //   const op = {
    //     name: 'change',
    //     from: res.data?.name,
    //     to: 'decision/workflows/justWf',
    //   } as RenameOperation<string>;
    //   await res.update('name', op);
    //   expect(res.data?.name).to.equal('decision/workflows/justWf');
    //   // states
    //   const newStates = [{ name: 'New', category: 'initial' }];
    //   const op2 = {
    //     name: 'change',
    //     from: (res.data as Workflow).states,
    //     to: newStates,
    //   } as RenameOperation<WorkflowState[]>;
    //   await res.update('states', op2);
    //   const states = (res.data as Workflow).states;
    //   console.error(states);
    //   expect(states && states.length).to.equal(1);
    //   if (states && states.length > 0 && states.at(0)) {
    //     const firstState = states.at(0);
    //     expect(firstState!.name).to.equal('New');
    //     expect(firstState!.category).to.equal('initial');
    //   }
    //   // transitions
    //   const newTransition = {
    //     name: 'Doodle',
    //     fromState: [],
    //     toState: 'New',
    //   };
    //   const op3 = {
    //     name: 'change',
    //     from: (res.data as Workflow).transitions,
    //     to: [newTransition],
    //   } as RenameOperation<WorkflowTransition[]>;
    //   await res.update('transitions', op3);
    //   const transitions = (res.data as Workflow).transitions;
    //   expect(transitions && transitions.length).to.equal(1);
    //   if (transitions && transitions.length > 0 && transitions.at(0)) {
    //     const firstTransition = transitions.at(0);
    //     expect(firstTransition!.name).to.equal('Doodle');
    //     expect(firstTransition!.toState).to.equal('New');
    //   }
    //   project.collectLocalResources();
    // });
    // Note that the delete operations depend on previously created and updated data.
    it('delete card type', async () => {
      const res = new CardTypeResource(
        project,
        resourceName('decision/cardTypes/newWF.json'),
      );
      const before = await project.cardTypes();
      let found = before.find(
        (item) => item.name === 'decision/cardTypes/newWF.json',
      );
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.workflows();
      found = after.find(
        (item) => item.name === 'decision/cardTypes/newWF.json',
      );
    });
    it('delete field type', async () => {
      const res = new FieldTypeResource(
        project,
        resourceName('decision/fieldTypes/newWF.json'),
      );
      const before = await project.fieldTypes();
      let found = before.find(
        (item) => item.name === 'decision/fieldTypes/newWF.json',
      );
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.fieldTypes();
      found = after.find(
        (item) => item.name === 'decision/fieldTypes/newWF.json',
      );
    });
    it('delete link type', async () => {
      const res = new LinkTypeResource(
        project,
        resourceName('decision/linkTypes/newWF.json'),
      );
      const before = await project.linkTypes();
      let found = before.find(
        (item) => item.name === 'decision/linkTypes/newWF.json',
      );
      expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.linkTypes();
      found = after.find(
        (item) => item.name === 'decision/linkTypes/newWF.json',
      );
    });
    it('delete workflow', async () => {
      const res = new WorkflowResource(
        project,
        resourceName('decision/workflows/justWf.json'),
      );
      const before = await project.workflows();
      let found = before.find(
        (item) => item.name === 'decision/workflows/justWf.json',
      );
      // when update test is fixed, uncomment
      //expect(found).to.not.equal(undefined);
      await res.delete();
      const after = await project.workflows();
      found = after.find(
        (item) => item.name === 'decision/workflows/justWf.json',
      );
      expect(found).to.equal(undefined);
    });
  });
});
