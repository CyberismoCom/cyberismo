// testing
import { expect } from 'chai';
import { after, before, describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathExists } from '../src/utils/file-utils.js';

import { copyDir } from '../src/utils/file-utils.js';
import {
  ResourceCache,
  ResourcesFrom,
} from '../src/containers/project/resource-cache.js';
import { Project } from '../src/containers/project.js';
import { CommandManager } from '../src/command-manager.js';
describe('Resource cache', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-resource-cache-tests');
  const testProjectPath = join(testDir, 'valid', 'decision-records');

  describe('using resource cache', () => {
    let project: Project;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(testProjectPath);
      await project.populateCaches();
    });

    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should create ResourceCache instance', () => {
      const cache = project['resources'];
      expect(cache).to.be.instanceOf(ResourceCache);
    });

    it('should collect local resources on initialization', () => {
      const workflows = project.workflows(ResourcesFrom.localOnly);
      expect(workflows).to.be.an('array');
      expect(workflows.length).to.be.greaterThan(0);
    });

    it('should collect all resource types', () => {
      const cardTypes = project.cardTypes(ResourcesFrom.localOnly);
      const fieldTypes = project.fieldTypes(ResourcesFrom.localOnly);
      const workflows = project.workflows(ResourcesFrom.localOnly);
      const templates = project.templates(ResourcesFrom.localOnly);

      expect(cardTypes.length).to.be.greaterThan(0);
      expect(fieldTypes.length).to.be.greaterThan(0);
      expect(workflows.length).to.be.greaterThan(0);
      expect(templates.length).to.be.greaterThan(0);
    });

    it('should keep data unchanged between collecting if no changes', () => {
      const beforeRefresh = project.workflows(ResourcesFrom.localOnly).length;
      project.collectLocalResources();
      const afterRefresh = project.workflows(ResourcesFrom.localOnly).length;
      expect(afterRefresh).to.equal(beforeRefresh);
    });
  });

  describe('accessing resources', () => {
    let project: Project;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(testProjectPath);
      await project.populateCaches();
    });

    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should check if resource exists', () => {
      const exists = project.resourceExists('decision/workflows/decision');
      expect(exists).to.equal(true);
    });

    it('should return false for non-existing resource', () => {
      const exists = project.resourceExists('decision/workflows/non_existing');
      expect(exists).to.equal(false);
    });

    it('should get resource by type and name', () => {
      const workflow = project.resourceByType(
        'decision/workflows/decision',
        'workflows',
      );
      expect(workflow).to.not.equal(undefined);
      expect(workflow.data).to.not.equal(undefined);
    });

    it('should extract resource type from name', () => {
      const type = project.resourceType('decision/workflows/decision');
      expect(type).to.equal('workflows');
    });

    it('should handle invalid resource names gracefully', () => {
      expect(() => project.resourceType('invalid-name')).to.throw();
    });

    it('should get resources of specific type', () => {
      const workflows = project.workflows(ResourcesFrom.localOnly);
      expect(workflows).to.be.an('array');
      expect(workflows.length).to.be.greaterThan(0);

      workflows.forEach((workflow) => {
        expect(workflow).to.have.property('data');
        expect(workflow.data).to.have.property('name');
        expect(workflow.data).to.have.property('displayName');
        expect(workflow.data).to.have.property('states');
        expect(workflow.data).to.have.property('transitions');
        expect(workflow.data?.states).to.be.an('array');
        expect(workflow.data?.transitions).to.be.an('array');
      });
    });

    it('should filter resources by source (local only)', () => {
      const localWorkflows = project.workflows(ResourcesFrom.localOnly);
      const allWorkflows = project.workflows(ResourcesFrom.all);

      expect(localWorkflows.length).to.be.greaterThan(0);
      expect(allWorkflows.length).to.be.greaterThan(0);

      localWorkflows.forEach((localRes) => {
        const found = allWorkflows.some(
          (res) => res.data?.name === localRes.data?.name,
        );
        expect(found).to.equal(true);
      });
    });

    it('should get all calculation resources', () => {
      const calculations = project.calculations(ResourcesFrom.all);
      expect(calculations).to.be.an('array');
    });

    it('should handle empty resource type', () => {
      const calculations = project.calculations(ResourcesFrom.localOnly);
      expect(calculations).to.be.an('array');
    });

    it('should get all card type resources', () => {
      const cardTypes = project.cardTypes(ResourcesFrom.all);
      expect(cardTypes).to.be.an('array');
      expect(cardTypes.length).to.be.greaterThan(0);
    });

    it('should get all field type resources', () => {
      const fieldTypes = project.fieldTypes(ResourcesFrom.all);
      expect(fieldTypes).to.be.an('array');
      expect(fieldTypes.length).to.be.greaterThan(0);
    });

    it('should get all graph model resources', () => {
      const graphModels = project.graphModels(ResourcesFrom.all);
      expect(graphModels).to.be.an('array');
    });

    it('should get all graph view resources', () => {
      const graphViews = project.graphViews(ResourcesFrom.all);
      expect(graphViews).to.be.an('array');
    });

    it('should get all link type resources', () => {
      const linkTypes = project.linkTypes(ResourcesFrom.all);
      expect(linkTypes).to.be.an('array');
      expect(linkTypes.length).to.be.greaterThan(0);
    });

    it('should get all report resources', () => {
      const reports = project.reports(ResourcesFrom.all);
      expect(reports).to.be.an('array');
    });

    it('should get all template resources', () => {
      const templates = project.templates(ResourcesFrom.all);
      expect(templates).to.be.an('array');
      expect(templates.length).to.be.greaterThan(0);
    });

    it('should get all workflow resources', () => {
      const workflows = project.workflows(ResourcesFrom.all);
      expect(workflows).to.be.an('array');
      expect(workflows.length).to.be.greaterThan(0);
    });

    it('should cache resource instances', () => {
      const workflowFirstInstance = project.resourceByType(
        'decision/workflows/decision',
        'workflows',
      );
      const workflowSecondInstance = project.resourceByType(
        'decision/workflows/decision',
        'workflows',
      );

      expect(workflowFirstInstance).to.equal(workflowSecondInstance);
    });

    it('should get workflow resource by type', () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = project.resourceByType(resourceName, 'workflows');

      expect(workflow).to.not.equal(undefined);
      expect(workflow.data).to.not.equal(undefined);
      expect(workflow.data?.name).to.equal(resourceName);
    });

    it('should get cardType resource by type', () => {
      const cardTypes = project.cardTypes(ResourcesFrom.localOnly);
      expect(cardTypes.length).to.be.greaterThan(0);

      const firstCardType = cardTypes[0].data!;
      const cardType = project.resourceByType(firstCardType.name, 'cardTypes');

      expect(cardType).to.not.equal(undefined);
      expect(cardType.data).to.not.equal(undefined);
    });

    it('should get fieldType resource by type', () => {
      const fieldTypes = project.fieldTypes(ResourcesFrom.localOnly);
      expect(fieldTypes.length).to.be.greaterThan(0);

      const firstFieldType = fieldTypes[0];
      const fieldType = project.resourceByType(
        firstFieldType.data?.name || '',
        'fieldTypes',
      );

      expect(fieldType).to.not.equal(undefined);
      expect(fieldType.data).to.not.equal(undefined);
    });

    it('should handle accessing resource with mismatched type', () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = project.resourceByType(resourceName, 'workflows');
      expect(workflow).to.not.equal(undefined);

      // Verify the resource type is correctly identified
      const type = project.resourceType(resourceName);
      expect(type).to.equal('workflows');
    });

    it('should convert singular to plural resource type', () => {
      const pluralType = project.resourceTypeFromSingular('workflow');
      expect(pluralType).to.equal('workflows');

      const pluralCardType = project.resourceTypeFromSingular('cardType');
      expect(pluralCardType).to.equal('cardTypes');

      const pluralFieldType = project.resourceTypeFromSingular('fieldType');
      expect(pluralFieldType).to.equal('fieldTypes');
    });

    it('should throw for unknown singular type', () => {
      expect(() => project.resourceTypeFromSingular('unknownType')).to.throw();
    });
  });

  describe('resource modifications', () => {
    let project: Project;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(testProjectPath);
      await project.populateCaches();
    });

    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should handle resource creation', async () => {
      const resourceName = 'decision/workflows/testWorkflow';

      const workflow = project.resourceByType(resourceName, 'workflows');
      await workflow.create({
        name: 'Initial',
        displayName: 'Initial',
        states: [],
        transitions: [],
      });
      expect(project.resourceExists(resourceName)).to.equal(true);
    });

    it('should handle resource deletion', async () => {
      const resourceName = 'decision/workflows/testWorkflowToDelete';

      // Create the resource
      const workflow = project.resourceByType(resourceName, 'workflows');
      await workflow.create({
        name: resourceName,
        displayName: 'Test Workflow',
        states: [],
        transitions: [],
      });

      // Verify it exists in both cache and filesystem
      expect(project.resourceExists(resourceName)).to.equal(true);
      const workflowPath = join(
        testProjectPath,
        '.cards',
        'local',
        'workflows',
        'testWorkflowToDelete.json',
      );
      expect(pathExists(workflowPath)).to.equal(true);

      // Delete the resource (removes from both filesystem and cache)
      await workflow.delete();

      // Verify it's gone from both cache and filesystem
      expect(project.resourceExists(resourceName)).to.equal(false);
      expect(pathExists(workflowPath)).to.equal(false);
    });

    it('should invalidate resource instance', () => {
      const resourceName = 'decision/workflows/decision';
      const workflowFirst = project.resourceByType(resourceName, 'workflows');

      project.invalidateResource(resourceName);

      const workflowThen = project.resourceByType(resourceName, 'workflows');

      expect(workflowFirst).to.not.equal(workflowThen);
      expect(workflowThen).to.not.equal(undefined);
    });

    it('should allow invalidating non-existent resource without error', () => {
      expect(() =>
        project.invalidateResource('decision/workflows/nonExistent'),
      ).to.not.throw();
    });

    it('should update resource in cache', () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = project.resourceByType(resourceName, 'workflows');

      project.updateResource(resourceName, workflow);

      const workflowLater = project.resourceByType(resourceName, 'workflows');
      expect(workflowLater).to.not.equal(undefined);
    });
  });

  describe('resources with modules', () => {
    let commands: CommandManager;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      commands = new CommandManager(testProjectPath);
      await commands.initialize();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should import and collect module resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

      const allWorkflows = commands.project.workflows(ResourcesFrom.all);

      expect(allWorkflows.length).to.be.greaterThan(0);

      const modules = commands.project.modules();
      const foundModule = modules.find((m) => m === 'base');
      expect(foundModule).to.not.equal(undefined);
    }).timeout(10000);

    it('should get module names', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

      const modules = commands.project.modules();
      expect(modules).to.be.an('array');
      expect(modules.length).to.be.greaterThan(0);

      modules.forEach((module) => {
        expect(module).length.to.be.greaterThan(0);
      });
    }).timeout(10000);

    it('should invalidate module resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

      const moduleNames = commands.project['resources'].moduleNames();
      expect(moduleNames.length).to.be.greaterThan(0);
      expect(moduleNames).to.include('base');

      const moduleEntry = commands.project.configuration.modules.find(
        (m) => m.location && m.location.includes('module-base'),
      );
      expect(moduleEntry).to.not.equal(undefined);
      await commands.removeCmd.remove('module', moduleEntry!.name);

      const remainingModuleNames = commands.project['resources'].moduleNames();
      expect(remainingModuleNames).to.not.include('base');
    }).timeout(10000);

    it('should get resource names from specific module', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

      const resourceCache = commands.project['resources'];
      const workflowNames = resourceCache.moduleResourceNames(
        'workflows',
        'base',
      );

      expect(workflowNames).to.be.an('array');
      expect(workflowNames.length).to.be.greaterThan(0);

      workflowNames.forEach((name) => {
        expect(name).to.be.a('string');
        expect(name.length).to.be.greaterThan(0);
      });
    }).timeout(10000);

    it('should return empty array for non-existent module', () => {
      const resourceCache = commands.project['resources'];
      const workflowNames = resourceCache.moduleResourceNames(
        'workflows',
        'nonExistentModule',
      );

      expect(workflowNames).to.be.an('array');
      expect(workflowNames.length).to.equal(0);
    });

    it('should filter local-only resources correctly', () => {
      const localWorkflows = commands.project.workflows(
        ResourcesFrom.localOnly,
      );
      const allWorkflows = commands.project.workflows(ResourcesFrom.all);

      expect(localWorkflows.length).to.be.greaterThan(0);
      expect(allWorkflows.length).to.be.greaterThanOrEqual(
        localWorkflows.length,
      );
    });

    it('should include module resources when using ResourcesFrom.all', async () => {
      const localOnlyBefore = commands.project.workflows(
        ResourcesFrom.localOnly,
      ).length;
      const allBefore = commands.project.workflows(ResourcesFrom.all).length;

      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

      const localOnlyAfter = commands.project.workflows(
        ResourcesFrom.localOnly,
      ).length;
      const allAfter = commands.project.workflows(ResourcesFrom.all).length;

      // Local count should not change
      expect(localOnlyAfter).to.equal(localOnlyBefore);
      // All count should increase (includes module resources)
      expect(allAfter).to.be.greaterThan(allBefore);
    }).timeout(10000);

    it('should get module-only resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(
        baseModule,
        commands.project.basePath,
      );

      const localWorkflows = commands.project.workflows(
        ResourcesFrom.localOnly,
      );
      const moduleWorkflows = commands.project.workflows(
        ResourcesFrom.importedOnly,
      );
      const allWorkflows = commands.project.workflows(ResourcesFrom.all);

      // Module-only should have resources
      expect(moduleWorkflows.length).to.be.greaterThan(0);

      // All should be at least as many as local or imported separately
      expect(allWorkflows.length).to.be.greaterThanOrEqual(
        localWorkflows.length,
      );
      expect(allWorkflows.length).to.be.greaterThanOrEqual(
        moduleWorkflows.length,
      );

      // Module workflows should be distinct from local workflows by name
      moduleWorkflows.forEach((moduleWorkflow) => {
        const foundInLocal = localWorkflows.some(
          (local) => local.data?.name === moduleWorkflow.data?.name,
        );
        expect(foundInLocal).to.equal(false);
      });
    }).timeout(10000);
  });

  describe('resource filtering by source', () => {
    let commands: CommandManager;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      commands = new CommandManager(testProjectPath);
      await commands.initialize();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('resource property validation', () => {
    let project: Project;

    before(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = new Project(testProjectPath);
      await project.populateCaches();
    });

    after(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should have valid name and path properties on workflows', () => {
      const workflows = project.workflows(ResourcesFrom.all);
      workflows.forEach((resource) => {
        expect(resource).to.have.property('data');
        expect(resource).to.have.property('fileName');
        expect(resource.data?.name).to.be.a('string');
        expect(resource.data?.name.length).to.be.greaterThan(0);
        expect(resource.data?.displayName).to.be.a('string');
        expect(resource.data?.states).to.be.an('array');
        expect(resource.data?.transitions).to.be.an('array');
      });
    });

    it('should have valid name and other properties on cardTypes', () => {
      const cardTypes = project.cardTypes(ResourcesFrom.all);
      cardTypes.forEach((resource) => {
        expect(resource).to.have.property('data');
        expect(resource).to.have.property('fileName');
        expect(resource.data?.name).to.be.a('string');
        expect(resource.data?.name.length).to.be.greaterThan(0);
        expect(resource.data?.workflow).to.be.a('string');
        expect(resource.data?.customFields).to.be.an('array');
      });
    });

    it('should have valid name and other properties on fieldTypes', () => {
      const fieldTypes = project.fieldTypes(ResourcesFrom.all);
      fieldTypes.forEach((resource) => {
        expect(resource).to.have.property('data');
        expect(resource).to.have.property('fileName');
        expect(resource.data?.name).to.be.a('string');
        expect(resource.data?.name.length).to.be.greaterThan(0);
        expect(resource.data?.displayName).to.be.a('string');
        expect(resource.data?.dataType).to.be.a('string');
      });
    });

    it('should have consistent resource type in name', () => {
      const workflows = project.workflows(ResourcesFrom.all);
      workflows.forEach((workflow) => {
        expect(workflow.data?.name).to.include('/workflows/');
      });

      const cardTypes = project.cardTypes(ResourcesFrom.all);
      cardTypes.forEach((cardType) => {
        expect(cardType.data?.name).to.include('/cardTypes/');
      });
    });
  });
});
