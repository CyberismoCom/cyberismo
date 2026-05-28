// tools/data-handler/test/mutations/plan.test.ts

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import { ResourceMutations } from '../../src/mutations/plan.js';
import { resourceName } from '../../src/utils/resource-utils.js';
import { copyDir, deleteDir } from '../../src/utils/file-utils.js';
import { ConfigurationLogger } from '../../src/utils/configuration-logger.js';
import { _registerHandlerForTest } from '../../src/mutations/dispatcher.js';
import type { Handler, MutationContext } from '../../src/mutations/handler.js';
import type { CascadePreview } from '../../src/mutations/types.js';

const testDir = join(import.meta.dirname, 'tmp-plan');
const fixturePath = join(testDir, 'valid', 'decision-records');

describe('ResourceMutations.plan + apply', () => {
  let project: Project;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    project = new Project(fixturePath);
    await project.populateCaches();
  });
  afterAll(async () => {
    await deleteDir(testDir);
  });

  it('plan() returns a PreviewResult for a display-only edit', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change' as const, target: 'Decision card type', to: 'New' },
    };
    const result = await mutations.plan(input);
    expect(result.isBreaking).toBe(false);
    expect(result.preview.affectedCardCount).toBe(0);
    expect(result.fingerprint.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('apply() succeeds for a non-cascading edit without fingerprint', async () => {
    const mutations = new ResourceMutations(project);
    const input = {
      kind: 'edit' as const,
      target: resourceName(`${project.projectPrefix}/cardTypes/decision`),
      updateKey: { key: 'displayName' },
      operation: { name: 'change' as const, target: 'Decision card type', to: 'New' },
    };
    await expect(mutations.apply(input)).resolves.toEqual({ success: true });
  });

  it('apply() with project_rename input writes a project_rename log entry', async () => {
    const mutations = new ResourceMutations(project);
    // We can't actually fire ProjectRenameHandler.apply() yet (no handler
    // registered), so test recordLogEntry through a stubbed handler.
    const oldPrefix = project.projectPrefix;
    const input = {
      kind: 'project_rename' as const,
      newPrefix: 'renamed',
    };
    // Use the private recordLogEntry directly via a small accessor.
    await (mutations as unknown as {
      recordLogEntry: (i: typeof input, ctx: { oldPrefix: string }) => Promise<void>;
    }).recordLogEntry(input, { oldPrefix });
    const entries = await ConfigurationLogger.entries(project.basePath);
    const last = entries[entries.length - 1];
    expect(last.kind).toBe('project_rename');
    expect(last.payload).toEqual({ oldPrefix, newPrefix: 'renamed' });
  });
});

// ---------------------------------------------------------------------------
// Handler split sequencing — validate / applyCascade / applyResourceOp
// ---------------------------------------------------------------------------

const SENTINEL_KEY = '__fake_split_test__';

/**
 * Build a fake Handler that uses the split API (validate / applyCascade /
 * applyResourceOp) and matches on a sentinel edit key so it can be injected
 * via _registerHandlerForTest without disturbing real routes.
 */
function makeFakeHandler(opts: {
  prefix: string;
  validateSpy: ReturnType<typeof vi.fn>;
  cascadeSpy: ReturnType<typeof vi.fn>;
  resourceOpSpy: ReturnType<typeof vi.fn>;
}): Handler {
  const noopPreview: CascadePreview = {
    affectedCardCount: 0,
    affectedLinkCount: 0,
    affectedCalculationCount: 0,
    affectedHandlebarFileCount: 0,
    dataLossExpected: false,
    summary: '(fake)',
  };
  return {
    isBreaking: false,
    matches(ctx: MutationContext): boolean {
      return (
        ctx.input.kind === 'edit' &&
        ctx.input.target.prefix === opts.prefix &&
        ctx.input.updateKey.key === SENTINEL_KEY
      );
    },
    async preview(): Promise<CascadePreview> {
      return noopPreview;
    },
    async validate(ctx: MutationContext): Promise<void> {
      opts.validateSpy(ctx);
    },
    async applyCascade(ctx: MutationContext): Promise<void> {
      opts.cascadeSpy(ctx);
    },
    async applyResourceOp(ctx: MutationContext): Promise<void> {
      opts.resourceOpSpy(ctx);
    },
    async affectedFilePaths(): Promise<string[]> {
      return [];
    },
  };
}

describe('Handler split sequencing (validate / applyCascade / applyResourceOp)', () => {
  const testDir2 = join(import.meta.dirname, 'tmp-plan-split');
  const fixturePath2 = join(testDir2, 'valid', 'decision-records');
  let project: Project;

  beforeAll(async () => {
    await mkdir(testDir2, { recursive: true });
    await copyDir('test/test-data/', testDir2);
    project = new Project(fixturePath2);
    await project.populateCaches();
  });
  afterAll(async () => {
    await deleteDir(testDir2);
  });

  it('applyCascade is called for a local-prefixed target', async () => {
    const validateSpy = vi.fn();
    const cascadeSpy = vi.fn();
    const resourceOpSpy = vi.fn();
    const localPrefix = project.projectPrefix;
    const handler = makeFakeHandler({ prefix: localPrefix, validateSpy, cascadeSpy, resourceOpSpy });
    const deregister = _registerHandlerForTest(handler);
    try {
      const mutations = new ResourceMutations(project);
      const input = {
        kind: 'edit' as const,
        target: resourceName(`${localPrefix}/cardTypes/decision`),
        updateKey: { key: SENTINEL_KEY },
        operation: { name: 'change' as const, target: 'x', to: 'y' },
      };
      await mutations.apply(input);
      expect(cascadeSpy).toHaveBeenCalledOnce();
    } finally {
      deregister();
    }
  });

  it('applyCascade is called for a foreign-prefixed target', async () => {
    const validateSpy = vi.fn();
    const cascadeSpy = vi.fn();
    const resourceOpSpy = vi.fn();
    const foreignPrefix = 'foreign-module';
    const handler = makeFakeHandler({ prefix: foreignPrefix, validateSpy, cascadeSpy, resourceOpSpy });
    const deregister = _registerHandlerForTest(handler);
    try {
      const mutations = new ResourceMutations(project);
      const input = {
        kind: 'edit' as const,
        target: resourceName(`${foreignPrefix}/cardTypes/something`),
        updateKey: { key: SENTINEL_KEY },
        operation: { name: 'change' as const, target: 'x', to: 'y' },
      };
      await mutations.apply(input);
      expect(cascadeSpy).toHaveBeenCalledOnce();
    } finally {
      deregister();
    }
  });

  it('applyResourceOp is called ONLY for a local-prefixed target', async () => {
    const validateSpy = vi.fn();
    const cascadeSpy = vi.fn();
    const resourceOpSpy = vi.fn();
    const localPrefix = project.projectPrefix;
    const handler = makeFakeHandler({ prefix: localPrefix, validateSpy, cascadeSpy, resourceOpSpy });
    const deregister = _registerHandlerForTest(handler);
    try {
      const mutations = new ResourceMutations(project);
      const input = {
        kind: 'edit' as const,
        target: resourceName(`${localPrefix}/cardTypes/decision`),
        updateKey: { key: SENTINEL_KEY },
        operation: { name: 'change' as const, target: 'x', to: 'y' },
      };
      await mutations.apply(input);
      expect(resourceOpSpy).toHaveBeenCalledOnce();
    } finally {
      deregister();
    }
  });

  it('applyResourceOp is NOT called for a foreign-prefixed target', async () => {
    const validateSpy = vi.fn();
    const cascadeSpy = vi.fn();
    const resourceOpSpy = vi.fn();
    const foreignPrefix = 'foreign-module';
    const handler = makeFakeHandler({ prefix: foreignPrefix, validateSpy, cascadeSpy, resourceOpSpy });
    const deregister = _registerHandlerForTest(handler);
    try {
      const mutations = new ResourceMutations(project);
      const input = {
        kind: 'edit' as const,
        target: resourceName(`${foreignPrefix}/cardTypes/something`),
        updateKey: { key: SENTINEL_KEY },
        operation: { name: 'change' as const, target: 'x', to: 'y' },
      };
      await mutations.apply(input);
      expect(resourceOpSpy).not.toHaveBeenCalled();
    } finally {
      deregister();
    }
  });

  it('validate is called by plan() and NOT by apply()', async () => {
    const validateSpy = vi.fn();
    const cascadeSpy = vi.fn();
    const resourceOpSpy = vi.fn();
    const localPrefix = project.projectPrefix;
    const handler = makeFakeHandler({ prefix: localPrefix, validateSpy, cascadeSpy, resourceOpSpy });
    const deregister = _registerHandlerForTest(handler);
    try {
      const mutations = new ResourceMutations(project);
      const input = {
        kind: 'edit' as const,
        target: resourceName(`${localPrefix}/cardTypes/decision`),
        updateKey: { key: SENTINEL_KEY },
        operation: { name: 'change' as const, target: 'x', to: 'y' },
      };
      // plan() should call validate
      await mutations.plan(input);
      expect(validateSpy).toHaveBeenCalledOnce();

      validateSpy.mockClear();

      // apply() should NOT call validate
      await mutations.apply(input);
      expect(validateSpy).not.toHaveBeenCalled();
    } finally {
      deregister();
    }
  });
});
