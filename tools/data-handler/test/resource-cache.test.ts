import { expect, describe, it, beforeEach, afterEach } from 'vitest';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { CommandManager } from '../src/command-manager.js';
import { copyDir, pathExists } from '../src/utils/file-utils.js';
import type { Project } from '../src/containers/project.js';
import { ResourceCache } from '../src/containers/project/resource-cache.js';
import { getTestProject } from './helpers/test-utils.js';
import { WorkflowCategory } from '../src/interfaces/resource-interfaces.js';
import { ResourcesFrom } from '../src/containers/project/resources-from.js';

describe('Resource cache', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-resource-cache-tests');
  const testProjectPath = join(testDir, 'valid', 'decision-records');

  describe('using resource cache', () => {
    let project: Project;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = getTestProject(testProjectPath);
      await project.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should correctly initialize the cache', () => {
      const cache = ResourceCache.create(project);
      // Verify some resource types were collected during initialization
      const workflows = cache.resources('workflows', ResourcesFrom.localOnly);
      const cardTypes = cache.resources('cardTypes', ResourcesFrom.localOnly);
      const fieldTypes = cache.resources('fieldTypes', ResourcesFrom.localOnly);
      expect(workflows.length).to.be.greaterThan(0);
      expect(cardTypes.length).to.be.greaterThan(0);
      expect(fieldTypes.length).to.be.greaterThan(0);
    });
    it('should access resources through resourceHandler', () => {
      const handler = project.resources;
      expect(handler).not.toBeUndefined();
      const workflows = handler.workflows();
      expect(workflows).to.be.an('array');
    });
    it('should collect local resources on initialization', () => {
      const workflows = project.resources.workflows(ResourcesFrom.localOnly);
      expect(workflows).to.be.an('array');
      expect(workflows.length).to.be.greaterThan(0);
    });
    it('should collect all resource types', () => {
      const calculations = project.resources.calculations(
        ResourcesFrom.localOnly,
      );
      const cardTypes = project.resources.cardTypes(ResourcesFrom.localOnly);
      const fieldTypes = project.resources.fieldTypes(ResourcesFrom.localOnly);
      const graphViews = project.resources.graphViews(ResourcesFrom.localOnly);
      const graphModels = project.resources.graphModels(
        ResourcesFrom.localOnly,
      );
      const linkTypes = project.resources.linkTypes(ResourcesFrom.localOnly);
      const reports = project.resources.reports(ResourcesFrom.localOnly);
      const templates = project.resources.templates(ResourcesFrom.localOnly);
      const workflows = project.resources.workflows(ResourcesFrom.localOnly);

      expect(calculations.length).to.be.greaterThan(0);
      expect(cardTypes.length).to.be.greaterThan(0);
      expect(fieldTypes.length).to.be.greaterThan(0);
      expect(graphViews.length).to.be.greaterThan(0);
      expect(graphModels.length).to.be.greaterThan(0);
      expect(linkTypes.length).to.be.greaterThan(0);
      expect(reports.length).to.be.greaterThan(0);
      expect(templates.length).to.be.greaterThan(0);
      expect(workflows.length).to.be.greaterThan(0);
    });
    it('should keep data unchanged between collecting if no changes', () => {
      const beforeRefresh = project.resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      project.resources.changed();
      const afterRefresh = project.resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      expect(afterRefresh).toBe(beforeRefresh);
    });
  });

  describe('accessing resources', () => {
    let project: Project;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = getTestProject(testProjectPath);
      await project.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should check if resource exists', () => {
      const exists = project.resources.exists('decision/workflows/decision');
      expect(exists).toBe(true);
    });
    it('should return false for non-existing resource', () => {
      const exists = project.resources.exists(
        'decision/workflows/non_existing',
      );
      expect(exists).toBe(false);
    });
    it('should get resource by type and name', () => {
      const workflow = project.resources.byType(
        'decision/workflows/decision',
        'workflows',
      );
      expect(workflow).not.toBeUndefined();
      expect(workflow.data).not.toBeUndefined();
    });
    it('should extract resource type from name', () => {
      const type = project.resources.extractType('decision/workflows/decision');
      expect(type).toBe('workflows');
    });
    it('should handle invalid resource names gracefully', () => {
      expect(() => project.resources.extractType('invalid-name')).toThrow();
    });
    it('should get resources of specific type', () => {
      const workflows = project.resources.workflows(ResourcesFrom.localOnly);
      expect(workflows).toBeInstanceOf(Array);
      expect(workflows.length).toBeGreaterThan(0);

      workflows.forEach((workflow) => {
        expect(workflow).toHaveProperty('data');
        expect(workflow.data).toHaveProperty('name');
        expect(workflow.data).toHaveProperty('displayName');
        expect(workflow.data).toHaveProperty('states');
        expect(workflow.data).toHaveProperty('transitions');
        expect(workflow.data!.states).toBeInstanceOf(Array);
        expect(workflow.data!.transitions).toBeInstanceOf(Array);
      });
    });
    it('should filter resources by source (local only)', () => {
      const localWorkflows = project.resources.workflows(
        ResourcesFrom.localOnly,
      );
      const allWorkflows = project.resources.workflows();

      expect(localWorkflows.length).toBeGreaterThan(0);
      expect(allWorkflows.length).toBeGreaterThan(0);

      localWorkflows.forEach((localRes) => {
        const found = allWorkflows.find(
          (res) => res.data?.name === localRes.data?.name,
        );
        expect(found).toBeTruthy();
      });
    });
    it('should get all calculation resources', () => {
      const calculations = project.resources.calculations();
      expect(calculations.length).toBeGreaterThan(0);
    });
    it('should get local calculations', () => {
      const calculations = project.resources.calculations(
        ResourcesFrom.localOnly,
      );
      expect(calculations.length).toBeGreaterThan(0);
    });
    it('should get all card type resources', () => {
      const cardTypes = project.resources.cardTypes();
      expect(cardTypes.length).toBeGreaterThan(0);
    });
    it('should get all field type resources', () => {
      const fieldTypes = project.resources.fieldTypes();
      expect(fieldTypes.length).toBeGreaterThan(0);
    });
    it('should get all graph model resources', () => {
      const graphModels = project.resources.graphModels();
      expect(graphModels.length).toBeGreaterThan(0);
    });
    it('should get all graph view resources', () => {
      const graphViews = project.resources.graphViews();
      expect(graphViews.length).toBeGreaterThan(0);
    });
    it('should get all link type resources', () => {
      const linkTypes = project.resources.linkTypes();
      expect(linkTypes.length).toBeGreaterThan(0);
    });
    it('should get all report resources', () => {
      const reports = project.resources.reports();
      expect(reports.length).toBeGreaterThan(0);
    });
    it('should get all template resources', () => {
      const templates = project.resources.templates();
      expect(templates.length).toBeGreaterThan(0);
    });
    it('should get all workflow resources', () => {
      const workflows = project.resources.workflows();
      expect(workflows.length).toBeGreaterThan(0);
    });
    it('should cache resource instances', () => {
      const workflowFirstInstance = project.resources.byType(
        'decision/workflows/decision',
        'workflows',
      );
      const workflowSecondInstance = project.resources.byType(
        'decision/workflows/decision',
        'workflows',
      );

      expect(workflowFirstInstance).toBe(workflowSecondInstance);
    });
    it('should get workflow resource by type', () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = project.resources.byType(resourceName, 'workflows');

      expect(workflow).not.toBeUndefined();
      expect(workflow.data).not.toBeUndefined();
      expect(workflow.data?.name).toBe(resourceName);
    });
    it('should get cardType resource by type', () => {
      const cardTypes = project.resources.cardTypes(ResourcesFrom.localOnly);
      expect(cardTypes.length).toBeGreaterThan(0);

      const firstCardType = cardTypes[0].data!;
      const cardType = project.resources.byType(
        firstCardType.name,
        'cardTypes',
      );

      expect(cardType).not.toBeUndefined();
      expect(cardType.data).not.toBeUndefined();
    });
    it('should get fieldType resource by type', () => {
      const fieldTypes = project.resources.fieldTypes(ResourcesFrom.localOnly);
      expect(fieldTypes.length).toBeGreaterThan(0);

      const firstFieldType = fieldTypes[0];
      const fieldType = project.resources.byType(
        firstFieldType.data?.name || '',
        'fieldTypes',
      );

      expect(fieldType).not.toBeUndefined();
      expect(fieldType.data).not.toBeUndefined();
    });
    it('should handle accessing resource with mismatched type', () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = project.resources.byType(resourceName, 'workflows');
      expect(workflow).not.toBeUndefined();

      // Verify the resource type is correctly identified
      const type = project.resources.extractType(resourceName);
      expect(type).toBe('workflows');
    });
    it('should convert singular to plural resource type', () => {
      const pluralType =
        project.resources.resourceTypeFromSingularType('workflow');
      expect(pluralType).toBe('workflows');

      const pluralCardType =
        project.resources.resourceTypeFromSingularType('cardType');
      expect(pluralCardType).toBe('cardTypes');

      const pluralFieldType =
        project.resources.resourceTypeFromSingularType('fieldType');
      expect(pluralFieldType).toBe('fieldTypes');
    });
    it('should throw for unknown singular type', () => {
      expect(() =>
        project.resources.resourceTypeFromSingularType('unknownType'),
      ).toThrow();
    });
  });

  describe('resource modifications', () => {
    let project: Project;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = getTestProject(testProjectPath);
      await project.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should handle resource creation', async () => {
      const resourceName = 'decision/workflows/testWorkflow';

      const workflow = project.resources.byType(resourceName, 'workflows');
      await workflow.create({
        name: resourceName,
        displayName: 'Test Workflow',
        states: [{ name: 'Draft', category: WorkflowCategory.initial }],
        transitions: [{ name: 'Create', fromState: [''], toState: 'Draft' }],
      });
      expect(project.resources.exists(resourceName)).toBe(true);
    });
    it('should handle resource deletion', async () => {
      const resourceName = 'decision/workflows/testWorkflowToDelete';
      const workflow = project.resources.byType(resourceName, 'workflows');
      await workflow.create({
        name: resourceName,
        displayName: 'Test Workflow',
        states: [{ name: 'Draft', category: WorkflowCategory.initial }],
        transitions: [{ name: 'Create', fromState: [''], toState: 'Draft' }],
      });

      expect(project.resources.exists(resourceName)).toBe(true);
      const workflowPath = join(
        testProjectPath,
        '.cards',
        'local',
        'workflows',
        'testWorkflowToDelete.json',
      );
      expect(pathExists(workflowPath)).toBe(true);

      // Delete the resource
      await workflow.delete();

      expect(project.resources.exists(resourceName)).toBe(false);
      expect(pathExists(workflowPath)).toBe(false);
    });
    it('should update resource in cache', async () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = project.resources.byType(resourceName, 'workflows');
      await workflow.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'Updated display name',
        },
      );
      // Fetch the resource from cache again. Check that value is changes (same instance).
      const workflowAfter = project.resources.byType(resourceName, 'workflows');
      expect(workflowAfter.data!.displayName).toBe('Updated display name');
    });
  });

  describe('resources with modules', () => {
    let commands: CommandManager;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      commands = new CommandManager(testProjectPath, {
        autoSaveConfiguration: false,
      });
      await commands.initialize();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should import and collect module resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(baseModule);

      const allWorkflows = commands.project.resources.workflows();
      expect(allWorkflows.length).toBeGreaterThan(0);

      const modules = commands.project.resources.moduleNames();
      const foundModule = modules.find((m) => m === 'base');
      expect(foundModule).not.toBeUndefined();
    }, 10000);
    it('should get module names', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(baseModule);

      const modules = commands.project.resources.moduleNames();
      expect(modules).toBeInstanceOf(Array);
      expect(modules.length).toBeGreaterThan(0);

      modules.forEach((module) => {
        expect(module.length).toBeGreaterThan(0);
      });
    }, 10000);
    it('should invalidate module resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await commands.importCmd.importModule(baseModule);

      const moduleNames = commands.project.resources.moduleNames();
      expect(moduleNames.length).toBeGreaterThan(0);
      expect(moduleNames).toContain('base');

      const moduleEntry = commands.project.configuration.modules.find(
        (m) => m.location && m.location.includes('module-base'),
      );
      expect(moduleEntry).not.toBeUndefined();
      await commands.removeCmd.remove('module', moduleEntry!.name);

      const remainingModuleNames = commands.project.resources.moduleNames();
      expect(remainingModuleNames).not.toContain('base');
    }, 10000);
    it('should get resource names from specific module', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(baseModule);

      const resourceHandler = commands.project.resources;
      const workflowNames = resourceHandler.moduleResourceNames(
        'workflows',
        'base',
      );

      expect(workflowNames).to.be.an('array');
      expect(workflowNames.length).to.be.greaterThan(0);

      workflowNames.forEach((name) => {
        expect(name).to.be.a('string');
        expect(name.length).to.be.greaterThan(0);
      });
    }, 10000);
    it('should return empty array for non-existent module', () => {
      const resourceHandler = commands.project.resources;
      const workflowNames = resourceHandler.moduleResourceNames(
        'workflows',
        'nonExistentModule',
      );

      expect(workflowNames).toBeInstanceOf(Array);
      expect(workflowNames.length).toBe(0);
    });
    it('should filter local-only resources correctly', () => {
      const localWorkflows = commands.project.resources.workflows(
        ResourcesFrom.localOnly,
      );
      const allWorkflows = commands.project.resources.workflows();

      expect(localWorkflows.length).toBeGreaterThan(0);
      expect(allWorkflows.length).toBeGreaterThanOrEqual(localWorkflows.length);
    });
    it('should include module resources when using ResourcesFrom.all', async () => {
      const localOnlyBefore = commands.project.resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      const allBefore = commands.project.resources.workflows().length;

      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(baseModule);

      const localOnlyAfter = commands.project.resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      const allAfter = commands.project.resources.workflows().length;

      // Local count should not change
      expect(localOnlyAfter).toBe(localOnlyBefore);
      // Total count should increase since it includes module resources
      expect(allAfter).toBeGreaterThan(allBefore);
    }, 10000);
    it('should get module-only resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(baseModule);

      const localWorkflows = commands.project.resources.workflows(
        ResourcesFrom.localOnly,
      );
      const moduleWorkflows = commands.project.resources.workflows(
        ResourcesFrom.importedOnly,
      );
      expect(moduleWorkflows.length).toBeGreaterThan(0);

      const allWorkflows = commands.project.resources.workflows();
      expect(allWorkflows.length).toBeGreaterThanOrEqual(localWorkflows.length);
      expect(allWorkflows.length).toBeGreaterThanOrEqual(
        moduleWorkflows.length,
      );

      // Module workflows should be distinct from local workflows by name
      moduleWorkflows.forEach((moduleWorkflow) => {
        const foundInLocal = localWorkflows.find(
          (local) => local.data?.name === moduleWorkflow.data?.name,
        );
        expect(foundInLocal).toBeUndefined();
      });
    }, 10000);
  });

  describe('resource property validation', () => {
    let project: Project;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = getTestProject(testProjectPath);
      await project.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should have valid name and path properties on workflows', () => {
      const workflows = project.resources.workflows();
      workflows.forEach((resource) => {
        expect(resource).toHaveProperty('data');
        expect(resource).toHaveProperty('fileName');
        expect(typeof resource.data!.name).toBe('string');
        expect(resource.data!.name.length).toBeGreaterThan(0);
        expect(typeof resource.data!.displayName).toBe('string');
        expect(resource.data!.states).toBeInstanceOf(Array);
        expect(resource.data!.transitions).toBeInstanceOf(Array);
      });
    });
    it('should have valid name and other properties on cardTypes', () => {
      const cardTypes = project.resources.cardTypes();
      cardTypes.forEach((resource) => {
        expect(resource).toHaveProperty('data');
        expect(resource).toHaveProperty('fileName');
        expect(typeof resource.data!.name).toBe('string');
        expect(resource.data!.name.length).toBeGreaterThan(0);
        expect(typeof resource.data!.workflow).toBe('string');
        expect(resource.data!.customFields).toBeInstanceOf(Array);
      });
    });
    it('should have valid name and other properties on fieldTypes', () => {
      const fieldTypes = project.resources.fieldTypes();
      fieldTypes.forEach((resource) => {
        expect(resource).toHaveProperty('data');
        expect(resource).toHaveProperty('fileName');
        expect(typeof resource.data!.name).toBe('string');
        expect(resource.data!.name.length).toBeGreaterThan(0);
        expect(typeof resource.data!.displayName).toBe('string');
        expect(typeof resource.data!.dataType).toBe('string');
      });
    });
    it('should have consistent resource type in name', () => {
      const workflows = project.resources.workflows();
      workflows.forEach((workflow) => {
        expect(workflow.data!.name).toContain('/workflows/');
      });

      const cardTypes = project.resources.cardTypes();
      cardTypes.forEach((cardType) => {
        expect(cardType.data!.name).toContain('/cardTypes/');
      });
    });
  });
});
