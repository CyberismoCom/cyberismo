import { expect, describe, it, beforeAll, afterAll } from 'vitest';

import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';

import { copyDir } from '../src/utils/file-utils.js';
import { getTestProject } from './helpers/test-utils.js';
import type { Project } from '../src/containers/project.js';
import { ResourceHandler } from '../src/containers/project/resource-handler.js';
import { ResourcesFrom } from '../src/containers/project/resources-from.js';

describe('ResourceHandler', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-resource-handler-tests');
  const testProjectPath = join(testDir, 'valid', 'decision-records');

  describe('basic functionality', () => {
    let project: Project;
    let resourceHandler: ResourceHandler;

    beforeAll(async () => {
      mkdirSync(testDir, { recursive: true });
      await copyDir('test/test-data/', testDir);
      project = getTestProject(testProjectPath);
      await project.populateCaches();
      resourceHandler = project.resources;
    });

    afterAll(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should successfully utilize ResourceCache.create to obtain an initialized cache', () => {
      const workflows = resourceHandler.workflows(ResourcesFrom.localOnly);
      expect(workflows.length).toBeGreaterThan(0);

      const workflow = resourceHandler.byType('decision', 'workflows');
      expect(workflow).not.toBeUndefined();
      expect(workflow.data).not.toBeUndefined();
    });

    it('should return ResourceHandler instance from project', () => {
      expect(resourceHandler).toBeInstanceOf(ResourceHandler);
    });

    it('should get resources of specific type', () => {
      const workflows = resourceHandler.workflows(ResourcesFrom.localOnly);
      expect(workflows).toBeInstanceOf(Array);
      expect(workflows.length).toBeGreaterThan(0);
    });

    it('should get all resource types', () => {
      const cardTypes = resourceHandler.cardTypes(ResourcesFrom.localOnly);
      const fieldTypes = resourceHandler.fieldTypes(ResourcesFrom.localOnly);
      const workflows = resourceHandler.workflows(ResourcesFrom.localOnly);
      const templates = resourceHandler.templates(ResourcesFrom.localOnly);

      expect(cardTypes.length).toBeGreaterThan(0);
      expect(fieldTypes.length).toBeGreaterThan(0);
      expect(workflows.length).toBeGreaterThan(0);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should check if resource exists', () => {
      const exists = resourceHandler.exists('decision/workflows/decision');
      expect(exists).toBe(true);
    });
    it('should return false for non-existing resource', () => {
      const exists = resourceHandler.exists('decision/workflows/non_existing');
      expect(exists).toBe(false);
    });
    it('should get resource by type and name', () => {
      const workflow = resourceHandler.byType('decision', 'workflows');
      expect(workflow).not.toBeUndefined();
      expect(workflow.data).not.toBeUndefined();
    });
    it('should extract resource type from name', () => {
      const type = resourceHandler.extractType('decision/workflows/decision');
      expect(type).toBe('workflows');
    });
    it('should handle invalid resource names gracefully', () => {
      expect(() => resourceHandler.extractType('invalid-name')).toThrow();
    });
    it('should get module names', () => {
      const moduleNames = resourceHandler.moduleNames();
      expect(moduleNames).toBeInstanceOf(Array);
    });
    it('should filter resources by source (local only)', () => {
      const localWorkflows = resourceHandler.workflows(ResourcesFrom.localOnly);
      const allWorkflows = resourceHandler.workflows();

      expect(localWorkflows.length).toBeGreaterThan(0);
      expect(allWorkflows.length).toBeGreaterThan(0);

      localWorkflows.forEach((localRes) => {
        const found = allWorkflows.some(
          (res) => res.data?.name === localRes.data?.name,
        );
        expect(found).toBe(true);
      });
    });
    it('should cache resource instances', () => {
      const workflowFirstInstance = resourceHandler.byType(
        'decision',
        'workflows',
      );
      const workflowSecondInstance = resourceHandler.byType(
        'decision',
        'workflows',
      );

      expect(workflowFirstInstance).toBe(workflowSecondInstance);
    });
    it('should keep data unchanged between collecting if no changes', () => {
      const beforeRefresh = resourceHandler.workflows(
        ResourcesFrom.localOnly,
      ).length;
      resourceHandler.changed();
      const afterRefresh = resourceHandler.workflows(
        ResourcesFrom.localOnly,
      ).length;
      expect(afterRefresh).toBe(beforeRefresh);
    });
  });
});
