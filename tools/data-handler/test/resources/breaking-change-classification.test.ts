import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import sinon from 'sinon';

import {
  ConfigurationLogger,
  ConfigurationOperation,
} from '../../src/utils/configuration-logger.js';
import {
  ResourceObject,
  type Operation,
  type ChangeOperation,
  type RemoveOperation,
  type ShowReturnType,
} from '../../src/resources/resource-object.js';
import { resourceNameToString } from '../../src/utils/resource-utils.js';
import type { ResourceName } from '../../src/utils/resource-utils.js';
import type { ResourceBaseMetadata } from '../../src/interfaces/resource-interfaces.js';
import type { ResourceFolderType } from '../../src/interfaces/project-interfaces.js';
import type { Project } from '../../src/containers/project.js';
import type { Logger } from 'pino';
import { getChildLogger } from '../../src/utils/log-utils.js';

/**
 * Concrete test subclass that exposes `logResourceOperation` publicly.
 */
class TestableResourceObject extends ResourceObject<
  ResourceBaseMetadata,
  never
> {
  constructor(
    project: Project,
    resName: ResourceName,
    type: ResourceFolderType,
  ) {
    super(project, resName, type);
  }

  public async testLogResourceOperation<Type>(
    operationType: 'create' | 'delete' | 'update' | 'rename',
    op?: Operation<Type>,
    key?: string,
  ): Promise<void> {
    const args = this.logTarget();
    switch (operationType) {
      case 'create':
        return;
      case 'delete':
        return ConfigurationLogger.logResourceDelete(...args);
      case 'update':
        return ConfigurationLogger.logResourceUpdate(...args, op!, key!);
      case 'rename':
        return ConfigurationLogger.logResourceRename(
          ...args,
          op as ChangeOperation<string>,
        );
    }
  }

  // Minimal abstract method stubs
  protected async create() {}
  protected async delete() {}
  protected async read() {}
  protected async rename() {}
  protected show(): ShowReturnType<ResourceBaseMetadata, never> {
    return this.content;
  }
  protected async update() {}
  protected async usage() {
    return [];
  }
  protected async validate() {}
  protected async write() {}
  protected get getType() {
    return this.type;
  }
  protected getLogger(name: string): Logger {
    return getChildLogger({ module: name });
  }
}

const testResourceName: ResourceName = {
  prefix: 'test',
  type: 'cardTypes',
  identifier: 'myResource',
};

const fakeProject = {
  basePath: '/fake/path',
  projectPrefix: 'test',
  resources: {
    exists: () => false,
  },
} as unknown as Project;

describe('breaking change classification', () => {
  let resource: TestableResourceObject;
  let logStub: sinon.SinonStub;

  beforeEach(() => {
    resource = new TestableResourceObject(
      fakeProject,
      testResourceName,
      'cardTypes',
    );
    logStub = sinon.stub(ConfigurationLogger, 'log').resolves();
  });

  afterEach(() => {
    sinon.restore();
  });

  const target = resourceNameToString(testResourceName);

  // ── 1. Operation types: create, delete, rename ──

  describe('operation types', () => {
    it('create is non-breaking (never logs)', async () => {
      await resource.testLogResourceOperation('create');
      expect(logStub.notCalled).toBe(true);
    });

    it('delete is breaking (logs RESOURCE_DELETE)', async () => {
      await resource.testLogResourceOperation('delete');
      expect(logStub.calledOnce).toBe(true);
      expect(logStub.firstCall.args[1].operation).toBe(
        ConfigurationOperation.RESOURCE_DELETE,
      );
      expect(logStub.firstCall.args[1].target).toBe(target);
      expect(logStub.firstCall.args[1].parameters.type).toBe('cardTypes');
    });

    it('rename is breaking (logs RESOURCE_RENAME)', async () => {
      const op: Operation<string> = {
        name: 'change',
        target: 'oldName',
        to: 'newName',
      };
      await resource.testLogResourceOperation('rename', op);
      expect(logStub.calledOnce).toBe(true);
      expect(logStub.firstCall.args[1].operation).toBe(
        ConfigurationOperation.RESOURCE_RENAME,
      );
      expect(logStub.firstCall.args[1].parameters.operation.target).toBe(
        'oldName',
      );
      expect(logStub.firstCall.args[1].parameters.operation.to).toBe('newName');
    });
  });

  // ── 2. Update: additive operations ──

  describe('update: additive operations', () => {
    it('add on any key is non-breaking', async () => {
      const op: Operation<string> = { name: 'add', target: 'value' };
      await resource.testLogResourceOperation('update', op, 'states');
      expect(logStub.notCalled).toBe(true);
    });

    it('rank on any key is non-breaking', async () => {
      const op: Operation<string> = {
        name: 'rank',
        target: 'value',
        newIndex: 2,
      };
      await resource.testLogResourceOperation('update', op, 'states');
      expect(logStub.notCalled).toBe(true);
    });
  });

  // ── 3. Update: NON_BREAKING_KEYS (all ops non-breaking) ──

  describe('update: NON_BREAKING_KEYS', () => {
    for (const key of ['alwaysVisibleFields', 'optionallyVisibleFields']) {
      it(`change on '${key}' is non-breaking`, async () => {
        const op: Operation<string> = {
          name: 'change',
          target: 'old',
          to: 'new',
        };
        await resource.testLogResourceOperation('update', op, key);
        expect(logStub.notCalled).toBe(true);
      });

      it(`remove on '${key}' is non-breaking`, async () => {
        const op: Operation<string> = { name: 'remove', target: 'value' };
        await resource.testLogResourceOperation('update', op, key);
        expect(logStub.notCalled).toBe(true);
      });
    }
  });

  // ── 4. Update: NON_BREAKING_CHANGE_KEYS ──

  describe('update: NON_BREAKING_CHANGE_KEYS', () => {
    for (const key of [
      'displayName',
      'description',
      'category',
      'outboundDisplayName',
      'inboundDisplayName',
    ]) {
      it(`change on '${key}' is non-breaking`, async () => {
        const op: Operation<string> = {
          name: 'change',
          target: 'old',
          to: 'new',
        };
        await resource.testLogResourceOperation('update', op, key);
        expect(logStub.notCalled).toBe(true);
      });
    }

    it("remove on 'displayName' is breaking", async () => {
      const op: Operation<string> = { name: 'remove', target: 'value' };
      await resource.testLogResourceOperation('update', op, 'displayName');
      expect(logStub.calledOnce).toBe(true);
      expect(logStub.firstCall.args[1].operation).toBe(
        ConfigurationOperation.RESOURCE_UPDATE,
      );
    });
  });

  // ── 5. Update: element-level identity check (isNonBreakingArrayChange) ──

  describe('update: element-level identity check', () => {
    describe('enumValues (identity: enumValue)', () => {
      it('change only enumDisplayValue is non-breaking', async () => {
        const op: Operation<{ enumValue: string; enumDisplayValue: string }> = {
          name: 'change',
          target: { enumValue: 'val1', enumDisplayValue: 'Old Label' },
          to: { enumValue: 'val1', enumDisplayValue: 'New Label' },
        };
        await resource.testLogResourceOperation('update', op, 'enumValues');
        expect(logStub.notCalled).toBe(true);
      });

      it('change enumValue itself is breaking', async () => {
        const op: Operation<{ enumValue: string; enumDisplayValue: string }> = {
          name: 'change',
          target: { enumValue: 'val1', enumDisplayValue: 'Label' },
          to: { enumValue: 'val2', enumDisplayValue: 'Label' },
        };
        await resource.testLogResourceOperation('update', op, 'enumValues');
        expect(logStub.calledOnce).toBe(true);
      });
    });

    describe('states (identity: name)', () => {
      it('change only category is non-breaking', async () => {
        const op: Operation<{ name: string; category: string }> = {
          name: 'change',
          target: { name: 'open', category: 'active' },
          to: { name: 'open', category: 'closed' },
        };
        await resource.testLogResourceOperation('update', op, 'states');
        expect(logStub.notCalled).toBe(true);
      });

      it('change name is breaking', async () => {
        const op: Operation<{ name: string; category: string }> = {
          name: 'change',
          target: { name: 'open', category: 'active' },
          to: { name: 'closed', category: 'active' },
        };
        await resource.testLogResourceOperation('update', op, 'states');
        expect(logStub.calledOnce).toBe(true);
      });
    });

    describe('customFields (identity: name, isCalculated)', () => {
      it('change only displayName is non-breaking', async () => {
        const op: Operation<{
          name: string;
          isCalculated: boolean;
          displayName: string;
        }> = {
          name: 'change',
          target: { name: 'f1', isCalculated: false, displayName: 'Old' },
          to: { name: 'f1', isCalculated: false, displayName: 'New' },
        };
        await resource.testLogResourceOperation('update', op, 'customFields');
        expect(logStub.notCalled).toBe(true);
      });

      it('change name is breaking', async () => {
        const op: Operation<{
          name: string;
          isCalculated: boolean;
          displayName: string;
        }> = {
          name: 'change',
          target: { name: 'f1', isCalculated: false, displayName: 'Label' },
          to: { name: 'f2', isCalculated: false, displayName: 'Label' },
        };
        await resource.testLogResourceOperation('update', op, 'customFields');
        expect(logStub.calledOnce).toBe(true);
      });

      it('change isCalculated is breaking', async () => {
        const op: Operation<{
          name: string;
          isCalculated: boolean;
          displayName: string;
        }> = {
          name: 'change',
          target: { name: 'f1', isCalculated: false, displayName: 'Label' },
          to: { name: 'f1', isCalculated: true, displayName: 'Label' },
        };
        await resource.testLogResourceOperation('update', op, 'customFields');
        expect(logStub.calledOnce).toBe(true);
      });
    });

    describe('transitions (non-breaking — no card data references them)', () => {
      it('any change is non-breaking', async () => {
        const op: Operation<{ name: string; fromState: string[] }> = {
          name: 'change',
          target: { name: 't1', fromState: ['open'] },
          to: { name: 't1', fromState: ['closed'] },
        };
        await resource.testLogResourceOperation('update', op, 'transitions');
        expect(logStub.calledOnce).toBe(false);
      });

      it('remove is non-breaking', async () => {
        const op: Operation<string> = { name: 'remove', target: 't1' };
        await resource.testLogResourceOperation('update', op, 'transitions');
        expect(logStub.calledOnce).toBe(false);
      });
    });
  });

  // ── 6. Update: remove on structural keys ──

  describe('update: remove on structural keys', () => {
    for (const key of [
      'states',
      'enumValues',
      'customFields',
      'sourceCardTypes',
    ]) {
      it(`remove on '${key}' is breaking`, async () => {
        const op: Operation<string> = { name: 'remove', target: 'value' };
        await resource.testLogResourceOperation('update', op, key);
        expect(logStub.calledOnce).toBe(true);
        expect(logStub.firstCall.args[1].operation).toBe(
          ConfigurationOperation.RESOURCE_UPDATE,
        );
      });
    }
  });

  // ── 7. Update: structural/unknown keys (always breaking) ──

  describe('update: structural/unknown keys', () => {
    for (const key of [
      'workflow',
      'dataType',
      'sourceCardTypes',
      'destinationCardTypes',
      'enableLinkDescription',
    ]) {
      it(`change on '${key}' is breaking`, async () => {
        const op: Operation<string> = {
          name: 'change',
          target: 'old',
          to: 'new',
        };
        await resource.testLogResourceOperation('update', op, key);
        expect(logStub.calledOnce).toBe(true);
        expect(logStub.firstCall.args[1].operation).toBe(
          ConfigurationOperation.RESOURCE_UPDATE,
        );
      });
    }
  });

  // ── 8. Log entry parameter verification ──

  describe('log entry parameter verification', () => {
    it('breaking update includes operation and key in parameters', async () => {
      const op: Operation<string> = { name: 'remove', target: 'value' };
      await resource.testLogResourceOperation('update', op, 'workflow');
      expect(logStub.calledOnce).toBe(true);
      const params = logStub.firstCall.args[1].parameters;
      expect(params.operation).toEqual(op);
      expect(params.key).toBe('workflow');
      expect(params.type).toBe('cardTypes');
    });

    it('target equals resourceNameToString(resourceName)', async () => {
      await resource.testLogResourceOperation('delete');
      expect(logStub.firstCall.args[1].target).toBe(target);
    });

    it('rename includes operation in parameters', async () => {
      const op: Operation<string> = {
        name: 'change',
        target: 'alpha',
        to: 'beta',
      };
      await resource.testLogResourceOperation('rename', op);
      const params = logStub.firstCall.args[1].parameters;
      expect(params.operation).toEqual(op);
    });

    it('parameters.type equals the resource type', async () => {
      await resource.testLogResourceOperation('delete');
      expect(logStub.firstCall.args[1].parameters.type).toBe('cardTypes');
    });

    it('breaking change with mappingTable includes it in parameters', async () => {
      const op: ChangeOperation<string> = {
        name: 'change',
        target: 'oldWorkflow',
        to: 'newWorkflow',
        mappingTable: { stateMapping: { open: 'active', closed: 'done' } },
      };
      await resource.testLogResourceOperation('update', op, 'workflow');
      expect(logStub.calledOnce).toBe(true);
      const params = logStub.firstCall.args[1].parameters;
      expect(params.operation).toEqual(op);
    });

    it('breaking change without mappingTable does not include it', async () => {
      const op: ChangeOperation<string> = {
        name: 'change',
        target: 'old',
        to: 'new',
      };
      await resource.testLogResourceOperation('update', op, 'workflow');
      const params = logStub.firstCall.args[1].parameters;
      expect(params.operation).toEqual(op);
    });

    it('breaking remove with replacementValue includes it in parameters', async () => {
      const op: RemoveOperation<string> = {
        name: 'remove',
        target: 'oldState',
        replacementValue: 'newState',
      };
      await resource.testLogResourceOperation('update', op, 'states');
      expect(logStub.calledOnce).toBe(true);
      const params = logStub.firstCall.args[1].parameters;
      expect(params.operation).toEqual(op);
    });

    it('breaking remove without replacementValue does not include it', async () => {
      const op: RemoveOperation<string> = {
        name: 'remove',
        target: 'oldState',
      };
      await resource.testLogResourceOperation('update', op, 'states');
      const params = logStub.firstCall.args[1].parameters;
      expect(params.operation).toEqual(op);
    });
  });
});
