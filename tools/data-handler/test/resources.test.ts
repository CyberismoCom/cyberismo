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
import { Update } from '../src/update.js';
import { Validate } from '../src/validate.js';

import { Project } from '../src/containers/project.js';
import {
  ResourceCollector,
  ResourcesFrom,
} from '../src/containers/project/resource-collector.js';

import { RemovableResourceTypes } from '../src/interfaces/project-interfaces.js';
import { Workflow } from '../src/interfaces/resource-interfaces.js';

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
  let updateCmd: Update;

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
    updateCmd = new Update(project);
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('collect resources', async () => {
    const collector = new ResourceCollector(
      project.projectPrefix,
      project.paths,
    );

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
    const collector = new ResourceCollector(
      project.projectPrefix,
      project.paths,
    );

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
    const collector = new ResourceCollector(
      project.projectPrefix,
      project.paths,
    );
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
    const collector = new ResourceCollector(
      project.projectPrefix,
      project.paths,
    );

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
    const collector = new ResourceCollector(
      project.projectPrefix,
      project.paths,
    );
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
    // only 'name' is supported for now.
    const collector = new ResourceCollector(
      project.projectPrefix,
      project.paths,
    );
    collector.collectLocalResources();
    const resourceName = `${project.projectPrefix}/workflows/decision`;
    const fileName = `${resourceName}.json`;
    const exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(true);

    const wf = (await collector.resource(
      'workflows',
      fileName,
      ResourcesFrom.localOnly,
    )) as Workflow;

    const newName = `${project.projectPrefix}/workflows/newName`;
    await updateCmd.updateValue(resourceName, 'name', newName);
    collector.changed();
    const updatedWf = (await collector.resource(
      'workflows',
      newName,
      ResourcesFrom.localOnly,
    )) as Workflow;
    expect(wf.name).to.not.equal(updatedWf.name);
    expect(updatedWf.name).to.equal(newName);
  });

  it('UpdateCmd: try to update folder file resource with invalid data', async () => {
    // only 'name' is supported for now.
    const collector = new ResourceCollector(
      project.projectPrefix,
      project.paths,
    );
    collector.collectLocalResources();
    const resourceName = `${project.projectPrefix}/workflows/simple`;
    const fileName = `${resourceName}.json`;
    const exists = await collector.resourceExists('workflows', fileName);
    expect(exists).to.equal(true);

    const invalidName = `${project.projectPrefix}/workflows/newName111`;
    await updateCmd
      .updateValue(resourceName, 'name', invalidName)
      .then(() => {
        expect(false).to.equal(true);
      })
      .catch((error) => {
        expect(error.message).to.equal(
          "Cannot change the name of the resource to 'decision/workflows/newName111'",
        );
      });
  });
});
