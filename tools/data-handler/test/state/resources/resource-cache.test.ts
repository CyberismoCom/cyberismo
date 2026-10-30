// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { expect, describe, it, beforeEach, afterEach } from 'vitest';

import { join } from 'node:path';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';

import { type Workspace } from '../../../src/api/workspace.js';
import { copyDir, pathExists } from '../../../src/shared/utils/file-utils.js';
import type { Checkout } from '../../../src/state/checkout/checkout.js';
import { ResourceCache } from '../../../src/state/resources/resource-cache.js';
import { getTestProject } from '../../helpers/test-utils.js';
import { WorkflowCategory } from '@cyberismo/model';
import { ResourcesFrom } from '../../../src/state/resources/resources-from.js';
import { openTestWorkspace } from '../../helpers/open-test-workspace.js';
import { checkoutOf } from '../../../src/state/checkout/internal.js';

describe('Resource cache', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-resource-cache-tests');
  const testProjectPath = join(testDir, 'valid', 'decision-records');

  describe('using resource cache', () => {
    let checkout: Checkout;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      checkout = getTestProject(testProjectPath);
      await checkout.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should correctly initialize the cache', () => {
      const cache = ResourceCache.create(checkout);
      // Verify some resource types were collected during initialization
      const workflows = cache.resources('workflows', ResourcesFrom.localOnly);
      const cardTypes = cache.resources('cardTypes', ResourcesFrom.localOnly);
      const fieldTypes = cache.resources('fieldTypes', ResourcesFrom.localOnly);
      expect(workflows.length).to.be.greaterThan(0);
      expect(cardTypes.length).to.be.greaterThan(0);
      expect(fieldTypes.length).to.be.greaterThan(0);
    });
    it('should access resources through resourceHandler', () => {
      const handler = checkout.resources;
      expect(handler).not.toBeUndefined();
      const workflows = handler.workflows();
      expect(workflows).to.be.an('array');
    });
    it('should collect local resources on initialization', () => {
      const workflows = checkout.resources.workflows(ResourcesFrom.localOnly);
      expect(workflows).to.be.an('array');
      expect(workflows.length).to.be.greaterThan(0);
    });
    it('should collect all resource types', () => {
      const calculations = checkout.resources.calculations(
        ResourcesFrom.localOnly,
      );
      const cardTypes = checkout.resources.cardTypes(ResourcesFrom.localOnly);
      const fieldTypes = checkout.resources.fieldTypes(ResourcesFrom.localOnly);
      const graphViews = checkout.resources.graphViews(ResourcesFrom.localOnly);
      const graphModels = checkout.resources.graphModels(
        ResourcesFrom.localOnly,
      );
      const linkTypes = checkout.resources.linkTypes(ResourcesFrom.localOnly);
      const reports = checkout.resources.reports(ResourcesFrom.localOnly);
      const templates = checkout.resources.templates(ResourcesFrom.localOnly);
      const workflows = checkout.resources.workflows(ResourcesFrom.localOnly);

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
      const beforeRefresh = checkout.resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      checkout.resources.changed();
      const afterRefresh = checkout.resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      expect(afterRefresh).toBe(beforeRefresh);
    });
  });

  describe.skipIf(process.platform === 'win32')('symlinks', () => {
    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
    });
    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('does not read a resource file replaced by a symlink after load', async () => {
      const checkout = getTestProject(testProjectPath);
      await checkout.populateCaches();
      const file = join(
        testProjectPath,
        '.cards',
        'local',
        'workflows',
        'decision.json',
      );
      const outside = join(testDir, 'outside.json');
      writeFileSync(
        outside,
        readFileSync(file, 'utf-8').replace('decision', 'LEAKED'),
      );
      rmSync(file);
      symlinkSync(outside, file);

      const workflow = checkout.resources.byType(
        'decision/workflows/decision',
        'workflows',
      );

      expect(JSON.stringify(workflow.data ?? {})).not.toContain('LEAKED');
    });

    it('does not collect from a resource folder that is a symlink', async () => {
      const folder = join(testProjectPath, '.cards', 'local', 'workflows');
      const moved = join(testDir, 'moved-workflows');
      renameSync(folder, moved);
      symlinkSync(moved, folder);
      const checkout = getTestProject(testProjectPath);
      await checkout.populateCaches();

      expect(checkout.resources.workflows(ResourcesFrom.localOnly)).toEqual([]);
    });
  });

  describe('accessing resources', () => {
    let checkout: Checkout;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      checkout = getTestProject(testProjectPath);
      await checkout.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should check if resource exists', () => {
      const exists = checkout.resources.exists('decision/workflows/decision');
      expect(exists).toBe(true);
    });
    it('should return false for non-existing resource', () => {
      const exists = checkout.resources.exists(
        'decision/workflows/non_existing',
      );
      expect(exists).toBe(false);
    });
    it('changedModules reloads a module resource overwritten in place', () => {
      const moduleDir = join(testProjectPath, '.cards', 'modules', 'mod');
      mkdirSync(join(moduleDir, 'fieldTypes'), { recursive: true });
      writeFileSync(
        join(moduleDir, 'cardsConfig.json'),
        JSON.stringify({ cardKeyPrefix: 'mod', name: 'mod', modules: [] }),
      );
      const file = join(moduleDir, 'fieldTypes', 'estimate.json');
      const write = (dataType: string) =>
        writeFileSync(
          file,
          JSON.stringify({
            name: 'mod/fieldTypes/estimate',
            displayName: '',
            dataType,
          }),
        );

      write('number');
      checkout.resources.changedModules();
      expect(
        checkout.resources.byType('mod/fieldTypes/estimate', 'fieldTypes').data
          ?.dataType,
      ).toBe('number');

      // Overwrite under the same key, as a module update does on disk.
      write('shortText');
      checkout.resources.changedModules();
      expect(
        checkout.resources.byType('mod/fieldTypes/estimate', 'fieldTypes').data
          ?.dataType,
      ).toBe('shortText');
    });

    it('should get resource by type and name', () => {
      const workflow = checkout.resources.byType(
        'decision/workflows/decision',
        'workflows',
      );
      expect(workflow).not.toBeUndefined();
      expect(workflow.data).not.toBeUndefined();
    });
    it('should extract resource type from name', () => {
      const type = checkout.resources.extractType(
        'decision/workflows/decision',
      );
      expect(type).toBe('workflows');
    });
    it('should handle invalid resource names gracefully', () => {
      expect(() => checkout.resources.extractType('invalid-name')).toThrow();
    });
    it('should get resources of specific type', () => {
      const workflows = checkout.resources.workflows(ResourcesFrom.localOnly);
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
      const localWorkflows = checkout.resources.workflows(
        ResourcesFrom.localOnly,
      );
      const allWorkflows = checkout.resources.workflows();

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
      const calculations = checkout.resources.calculations();
      expect(calculations.length).toBeGreaterThan(0);
    });
    it('should get local calculations', () => {
      const calculations = checkout.resources.calculations(
        ResourcesFrom.localOnly,
      );
      expect(calculations.length).toBeGreaterThan(0);
    });
    it('should get all card type resources', () => {
      const cardTypes = checkout.resources.cardTypes();
      expect(cardTypes.length).toBeGreaterThan(0);
    });
    it('should get all field type resources', () => {
      const fieldTypes = checkout.resources.fieldTypes();
      expect(fieldTypes.length).toBeGreaterThan(0);
    });
    it('should get all graph model resources', () => {
      const graphModels = checkout.resources.graphModels();
      expect(graphModels.length).toBeGreaterThan(0);
    });
    it('should get all graph view resources', () => {
      const graphViews = checkout.resources.graphViews();
      expect(graphViews.length).toBeGreaterThan(0);
    });
    it('should get all link type resources', () => {
      const linkTypes = checkout.resources.linkTypes();
      expect(linkTypes.length).toBeGreaterThan(0);
    });
    it('should get all report resources', () => {
      const reports = checkout.resources.reports();
      expect(reports.length).toBeGreaterThan(0);
    });
    it('should get all template resources', () => {
      const templates = checkout.resources.templates();
      expect(templates.length).toBeGreaterThan(0);
    });
    it('should get all workflow resources', () => {
      const workflows = checkout.resources.workflows();
      expect(workflows.length).toBeGreaterThan(0);
    });
    it('should cache resource instances', () => {
      const workflowFirstInstance = checkout.resources.byType(
        'decision/workflows/decision',
        'workflows',
      );
      const workflowSecondInstance = checkout.resources.byType(
        'decision/workflows/decision',
        'workflows',
      );

      expect(workflowFirstInstance).toBe(workflowSecondInstance);
    });
    it('should get workflow resource by type', () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = checkout.resources.byType(resourceName, 'workflows');

      expect(workflow).not.toBeUndefined();
      expect(workflow.data).not.toBeUndefined();
      expect(workflow.data?.name).toBe(resourceName);
    });
    it('should get cardType resource by type', () => {
      const cardTypes = checkout.resources.cardTypes(ResourcesFrom.localOnly);
      expect(cardTypes.length).toBeGreaterThan(0);

      const firstCardType = cardTypes[0].data!;
      const cardType = checkout.resources.byType(
        firstCardType.name,
        'cardTypes',
      );

      expect(cardType).not.toBeUndefined();
      expect(cardType.data).not.toBeUndefined();
    });
    it('should get fieldType resource by type', () => {
      const fieldTypes = checkout.resources.fieldTypes(ResourcesFrom.localOnly);
      expect(fieldTypes.length).toBeGreaterThan(0);

      const firstFieldType = fieldTypes[0];
      const fieldType = checkout.resources.byType(
        firstFieldType.data?.name || '',
        'fieldTypes',
      );

      expect(fieldType).not.toBeUndefined();
      expect(fieldType.data).not.toBeUndefined();
    });
    it('should handle accessing resource with mismatched type', () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = checkout.resources.byType(resourceName, 'workflows');
      expect(workflow).not.toBeUndefined();

      // Verify the resource type is correctly identified
      const type = checkout.resources.extractType(resourceName);
      expect(type).toBe('workflows');
    });
    it('should convert singular to plural resource type', () => {
      const pluralType =
        checkout.resources.resourceTypeFromSingularType('workflow');
      expect(pluralType).toBe('workflows');

      const pluralCardType =
        checkout.resources.resourceTypeFromSingularType('cardType');
      expect(pluralCardType).toBe('cardTypes');

      const pluralFieldType =
        checkout.resources.resourceTypeFromSingularType('fieldType');
      expect(pluralFieldType).toBe('fieldTypes');
    });
    it('should throw for unknown singular type', () => {
      expect(() =>
        checkout.resources.resourceTypeFromSingularType('unknownType'),
      ).toThrow();
    });
  });

  describe('resource modifications', () => {
    let checkout: Checkout;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      checkout = getTestProject(testProjectPath);
      await checkout.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should handle resource creation', async () => {
      const resourceName = 'decision/workflows/testWorkflow';

      const workflow = checkout.resources.byType(resourceName, 'workflows');
      await workflow.create({
        name: resourceName,
        displayName: 'Test Workflow',
        states: [{ name: 'Draft', category: WorkflowCategory.initial }],
        transitions: [{ name: 'Create', fromState: [''], toState: 'Draft' }],
      });
      expect(checkout.resources.exists(resourceName)).toBe(true);
    });
    it('should handle resource deletion', async () => {
      const resourceName = 'decision/workflows/testWorkflowToDelete';
      const workflow = checkout.resources.byType(resourceName, 'workflows');
      await workflow.create({
        name: resourceName,
        displayName: 'Test Workflow',
        states: [{ name: 'Draft', category: WorkflowCategory.initial }],
        transitions: [{ name: 'Create', fromState: [''], toState: 'Draft' }],
      });

      expect(checkout.resources.exists(resourceName)).toBe(true);
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

      expect(checkout.resources.exists(resourceName)).toBe(false);
      expect(pathExists(workflowPath)).toBe(false);
    });
    it('should update resource in cache', async () => {
      const resourceName = 'decision/workflows/decision';
      const workflow = checkout.resources.byType(resourceName, 'workflows');
      await workflow.update(
        { key: 'displayName' },
        {
          name: 'change',
          target: '',
          to: 'Updated display name',
        },
      );
      // Fetch the resource from cache again. Check that value is changes (same instance).
      const workflowAfter = checkout.resources.byType(
        resourceName,
        'workflows',
      );
      expect(workflowAfter.data!.displayName).toBe('Updated display name');
    });
  });

  describe('resources with modules', () => {
    let ws: Workspace;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      ws = await openTestWorkspace(testProjectPath, {});
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should import and collect module resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await ws.modules.install(baseModule);

      const allWorkflows = checkoutOf(ws).resources.workflows();
      expect(allWorkflows.length).toBeGreaterThan(0);

      const modules = checkoutOf(ws).resources.moduleNames();
      const foundModule = modules.find((m) => m === 'base');
      expect(foundModule).not.toBeUndefined();
    }, 60000);
    it('should get module names', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await ws.modules.install(baseModule);

      const modules = checkoutOf(ws).resources.moduleNames();
      expect(modules).toBeInstanceOf(Array);
      expect(modules.length).toBeGreaterThan(0);

      modules.forEach((module) => {
        expect(module.length).toBeGreaterThan(0);
      });
    }, 60000);
    it('should invalidate module resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';

      await ws.modules.install(baseModule);

      const moduleNames = checkoutOf(ws).resources.moduleNames();
      expect(moduleNames.length).toBeGreaterThan(0);
      expect(moduleNames).toContain('base');

      const moduleEntry = checkoutOf(ws).configuration.modules.find(
        (m) => m.location && m.location.includes('module-base'),
      );
      expect(moduleEntry).not.toBeUndefined();
      await ws.modules.remove(moduleEntry!.name);

      const remainingModuleNames = checkoutOf(ws).resources.moduleNames();
      expect(remainingModuleNames).not.toContain('base');
    }, 60000);
    it('should get resource names from specific module', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await ws.modules.install(baseModule);

      const resourceHandler = checkoutOf(ws).resources;
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
    }, 60000);
    it('should return empty array for non-existent module', () => {
      const resourceHandler = checkoutOf(ws).resources;
      const workflowNames = resourceHandler.moduleResourceNames(
        'workflows',
        'nonExistentModule',
      );

      expect(workflowNames).toBeInstanceOf(Array);
      expect(workflowNames.length).toBe(0);
    });
    it('should filter local-only resources correctly', () => {
      const localWorkflows = checkoutOf(ws).resources.workflows(
        ResourcesFrom.localOnly,
      );
      const allWorkflows = checkoutOf(ws).resources.workflows();

      expect(localWorkflows.length).toBeGreaterThan(0);
      expect(allWorkflows.length).toBeGreaterThanOrEqual(localWorkflows.length);
    });
    it('should include module resources when using ResourcesFrom.all', async () => {
      const localOnlyBefore = checkoutOf(ws).resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      const allBefore = checkoutOf(ws).resources.workflows().length;

      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await ws.modules.install(baseModule);

      const localOnlyAfter = checkoutOf(ws).resources.workflows(
        ResourcesFrom.localOnly,
      ).length;
      const allAfter = checkoutOf(ws).resources.workflows().length;

      // Local count should not change
      expect(localOnlyAfter).toBe(localOnlyBefore);
      // Total count should increase since it includes module resources
      expect(allAfter).toBeGreaterThan(allBefore);
    }, 60000);
    it('should get module-only resources', async () => {
      const baseModule = 'https://github.com/CyberismoCom/module-base.git';
      await ws.modules.install(baseModule);

      const localWorkflows = checkoutOf(ws).resources.workflows(
        ResourcesFrom.localOnly,
      );
      const moduleWorkflows = checkoutOf(ws).resources.workflows(
        ResourcesFrom.importedOnly,
      );
      expect(moduleWorkflows.length).toBeGreaterThan(0);

      const allWorkflows = checkoutOf(ws).resources.workflows();
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
    }, 60000);
  });

  describe('resource property validation', () => {
    let checkout: Checkout;

    beforeEach(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      checkout = getTestProject(testProjectPath);
      await checkout.populateCaches();
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });
    it('should have valid name and path properties on workflows', () => {
      const workflows = checkout.resources.workflows();
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
      const cardTypes = checkout.resources.cardTypes();
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
      const fieldTypes = checkout.resources.fieldTypes();
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
      const workflows = checkout.resources.workflows();
      workflows.forEach((workflow) => {
        expect(workflow.data!.name).toContain('/workflows/');
      });

      const cardTypes = checkout.resources.cardTypes();
      cardTypes.forEach((cardType) => {
        expect(cardType.data!.name).toContain('/cardTypes/');
      });
    });
  });
});
