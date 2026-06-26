import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ModuleReplayConflictError,
  ModuleReplayFailedError,
  ModuleValidationFailedError,
  executeModuleReplays,
  filterStepsToApplied,
  planModuleReplays,
} from '../../../src/mutations/replay/replay.js';
import { formatSealFileName } from '../../../src/mutations/replay/seal-files.js';
import { ResourceMutations } from '../../../src/mutations/resource-mutations.js';
import { toVersion } from '../../../src/modules/types.js';

import type { ConfigurationLogEntry } from '../../../src/utils/configuration-logger.js';
import type { ModuleInstallation } from '../../../src/modules/types.js';
import type { Project } from '../../../src/containers/project.js';
import type { ReplayStep } from '../../../src/mutations/replay/replay.js';
import type { ResolvedModule } from '../../../src/modules/resolver.js';

const tmpDir = join(import.meta.dirname, 'tmp-replay-test');

function logLine(
  operation: ConfigurationLogEntry['operation'],
  target: string,
  parameters?: Record<string, unknown>,
): string {
  return JSON.stringify({
    timestamp: '2026-01-01T00:00:00.000Z',
    operation,
    target,
    ...(parameters ? { parameters } : {}),
  });
}

interface SealSpec {
  from: string;
  to: string;
  lines: string[];
}

async function writeSeals(folder: string, seals: SealSpec[]): Promise<void> {
  await mkdir(folder, { recursive: true });
  for (const seal of seals) {
    await writeFile(
      join(folder, formatSealFileName(seal.from, seal.to)),
      seal.lines.join('\n') + '\n',
    );
  }
}

async function makeInstalled(
  name: string,
  location: string,
  version: string | undefined,
  seals: SealSpec[] = [],
): Promise<ModuleInstallation> {
  const path = join(tmpDir, 'installed', name);
  await mkdir(path, { recursive: true });
  await writeSeals(join(path, 'migrations'), seals);
  return {
    project: tmpDir,
    name,
    source: { location },
    version: version === undefined ? undefined : toVersion(version),
    path,
    declaredDependencies: [],
  };
}

async function makeResolved(
  name: string,
  location: string,
  version: string | undefined,
  seals: SealSpec[] = [],
): Promise<ResolvedModule> {
  const stagedPath = join(tmpDir, 'staged', name);
  await mkdir(stagedPath, { recursive: true });
  await writeSeals(join(stagedPath, '.cards', 'local', 'migrations'), seals);
  return {
    declaration: { project: tmpDir, name, source: { location } },
    remoteUrl: location,
    version: version === undefined ? undefined : toVersion(version),
    stagedPath,
  };
}

describe('planModuleReplays', () => {
  beforeEach(async () => {
    await mkdir(tmpDir, { recursive: true });
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('bootstrap: no installed entry for the source yields no step', async () => {
    const resolved = await makeResolved('mod', 'file:/x', '1.0.0', [
      {
        from: '0.0.0',
        to: '1.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    expect(await planModuleReplays([resolved], [])).toEqual([]);
  });

  it('installed version missing yields no step', async () => {
    const installed = await makeInstalled('mod', 'file:/x', undefined);
    const resolved = await makeResolved('mod', 'file:/x', '1.0.0', [
      {
        from: '0.0.0',
        to: '1.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    expect(await planModuleReplays([resolved], [installed])).toEqual([]);
  });

  it('resolved version missing yields no step', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0');
    const resolved = await makeResolved('mod', 'file:/x', undefined, [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    expect(await planModuleReplays([resolved], [installed])).toEqual([]);
  });

  it('from == to yields no step', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0');
    const resolved = await makeResolved('mod', 'file:/x', '1.0.0', [
      {
        from: '0.0.0',
        to: '1.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    expect(await planModuleReplays([resolved], [installed])).toEqual([]);
  });

  it('empty chain in range yields no step', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0', [
      {
        from: '0.0.0',
        to: '1.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    // A patch jump within one minor line: no seal covers (1.0.0, 1.0.1], and
    // because from and to share a minor line that empty range is a no-op
    // rather than a gap.
    const resolved = await makeResolved('mod', 'file:/x', '1.0.1', [
      {
        from: '0.0.0',
        to: '1.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    expect(await planModuleReplays([resolved], [installed])).toEqual([]);
  });

  it('downgrade is a conflict', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '2.0.0');
    const resolved = await makeResolved('mod', 'file:/x', '1.0.0');
    const error = await planModuleReplays([resolved], [installed]).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ModuleReplayConflictError);
    expect(error.conflicts).toEqual([
      {
        modulePrefix: 'mod',
        kind: 'downgrade',
        detail: expect.stringContaining('2.0.0'),
      },
    ]);
    expect(error.message).toContain('No files were changed.');
  });

  it('diverged seals are a non_linear conflict naming the missing file', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.1.0', [
      {
        from: '1.0.0',
        to: '1.1.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    const resolved = await makeResolved('mod', 'file:/x', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/b')],
      },
    ]);
    const error = await planModuleReplays([resolved], [installed]).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ModuleReplayConflictError);
    expect(error.conflicts).toHaveLength(1);
    expect(error.conflicts[0].kind).toBe('non_linear');
    expect(error.conflicts[0].detail).toContain(
      formatSealFileName('1.0.0', '1.1.0'),
    );
  });

  it('a gap in the staged chain is a chain_gap conflict', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0');
    // The staged chain starts at 2.0.0 but the update begins at 1.0.0.
    const resolved = await makeResolved('mod', 'file:/x', '3.0.0', [
      {
        from: '2.0.0',
        to: '3.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a')],
      },
    ]);
    const error = await planModuleReplays([resolved], [installed]).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ModuleReplayConflictError);
    expect(error.conflicts).toHaveLength(1);
    expect(error.conflicts[0].kind).toBe('chain_gap');
    expect(error.conflicts[0].detail).toMatch(/gap/i);
  });

  it('conflicts from multiple modules are reported together', async () => {
    const installedA = await makeInstalled('aaa', 'file:/a', '2.0.0');
    const resolvedA = await makeResolved('aaa', 'file:/a', '1.0.0');
    const installedB = await makeInstalled('bbb', 'file:/b', '1.0.0');
    const resolvedB = await makeResolved('bbb', 'file:/b', '3.0.0', [
      {
        from: '2.0.0',
        to: '3.0.0',
        lines: [logLine('resource_delete', 'bbb/fieldTypes/a')],
      },
    ]);
    const error = await planModuleReplays(
      [resolvedA, resolvedB],
      [installedA, installedB],
    ).catch((e) => e);
    expect(error).toBeInstanceOf(ModuleReplayConflictError);
    expect(error.conflicts).toHaveLength(2);
    const kinds = new Map(
      error.conflicts.map((c: { modulePrefix: string; kind: string }) => [
        c.modulePrefix,
        c.kind,
      ]),
    );
    expect(kinds.get('aaa')).toBe('downgrade');
    expect(kinds.get('bbb')).toBe('chain_gap');
  });

  it('happy path: one seal with two entries becomes one step in order', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0');
    const resolved = await makeResolved('mod', 'file:/x', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [
          logLine('resource_delete', 'mod/fieldTypes/first', {
            type: 'fieldTypes',
          }),
          logLine('resource_delete', 'mod/fieldTypes/second', {
            type: 'fieldTypes',
          }),
        ],
      },
    ]);

    const steps = await planModuleReplays([resolved], [installed]);
    expect(steps).toHaveLength(1);
    expect(steps[0].modulePrefix).toBe('mod');
    expect(steps[0].fromVersion).toBe('1.0.0');
    expect(steps[0].toVersion).toBe('2.0.0');
    expect(steps[0].seals).toHaveLength(1);
    expect(steps[0].seals[0].seal.fileName).toBe(
      formatSealFileName('1.0.0', '2.0.0'),
    );
    expect(steps[0].seals[0].entries.map((e) => e.target)).toEqual([
      'mod/fieldTypes/first',
      'mod/fieldTypes/second',
    ]);
  });

  it('cross-module workflow-state change + card-type workflow change is a split_workflow_ownership conflict', async () => {
    const installedWf = await makeInstalled('wf', 'file:/wf', '1.0.0');
    const resolvedWf = await makeResolved('wf', 'file:/wf', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [
          logLine('resource_update', 'wf/workflows/Flow', {
            key: 'states',
            operation: { name: 'change' },
          }),
        ],
      },
    ]);
    const installedCt = await makeInstalled('ct', 'file:/ct', '1.0.0');
    const resolvedCt = await makeResolved('ct', 'file:/ct', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [
          logLine('resource_update', 'ct/cardTypes/Task', {
            key: 'workflow',
            operation: { name: 'change' },
          }),
        ],
      },
    ]);
    const error = await planModuleReplays(
      [resolvedWf, resolvedCt],
      [installedWf, installedCt],
    ).catch((e) => e);
    expect(error).toBeInstanceOf(ModuleReplayConflictError);
    const split = error.conflicts.find(
      (c: { kind: string }) => c.kind === 'split_workflow_ownership',
    );
    expect(split).toBeDefined();
    expect(split.modulePrefix).toBe('ct');
  });

  it('same-module workflow-state + card-type workflow change is not a split conflict', async () => {
    const installed = await makeInstalled('mod', 'file:/m', '1.0.0');
    const resolved = await makeResolved('mod', 'file:/m', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [
          logLine('resource_update', 'mod/workflows/Flow', {
            key: 'states',
            operation: { name: 'remove' },
          }),
          logLine('resource_update', 'mod/cardTypes/Task', {
            key: 'workflow',
            operation: { name: 'change' },
          }),
        ],
      },
    ]);
    // Both changes are owned by the same module and replay in version order;
    // no cross-module ordering hazard, so planning succeeds.
    const steps = await planModuleReplays([resolved], [installed]);
    expect(steps).toHaveLength(1);
  });

  it('correlates by source location: a renamed prefix is an update, not a bootstrap', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0');
    const resolved = await makeResolved('newmod', 'file:/x', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [
          logLine('project_rename', 'newmod', {
            oldPrefix: 'mod',
            newPrefix: 'newmod',
          }),
        ],
      },
    ]);

    const steps = await planModuleReplays([resolved], [installed]);
    expect(steps).toHaveLength(1);
    expect(steps[0].modulePrefix).toBe('newmod');
  });

  it('a malformed seal line throws at plan time naming module, seal and line', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0');
    const resolved = await makeResolved('mod', 'file:/x', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [logLine('resource_delete', 'mod/fieldTypes/a'), 'not json'],
      },
    ]);

    const error = await planModuleReplays([resolved], [installed]).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ModuleReplayConflictError);
    expect(error.message).toContain("module 'mod'");
    expect(error.message).toContain(formatSealFileName('1.0.0', '2.0.0'));
    expect(error.message).toContain('line 2');
  });

  it('an unknown operation throws at plan time naming module, seal, line and operation', async () => {
    const installed = await makeInstalled('mod', 'file:/x', '1.0.0');
    const resolved = await makeResolved('mod', 'file:/x', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [
          logLine('resource_delete', 'mod/fieldTypes/a'),
          JSON.stringify({
            timestamp: '2026-01-01T00:00:00.000Z',
            operation: 'resource_frobnicate',
            target: 'mod/fieldTypes/b',
          }),
        ],
      },
    ]);

    const error = await planModuleReplays([resolved], [installed]).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ModuleReplayConflictError);
    expect(error.message).toContain("module 'mod'");
    expect(error.message).toContain(formatSealFileName('1.0.0', '2.0.0'));
    expect(error.message).toContain('line 2');
    expect(error.message).toContain("unknown operation 'resource_frobnicate'");
  });

  it('steps come out in reverse resolved order (dependencies first)', async () => {
    const installedRoot = await makeInstalled('root', 'file:/root', '1.0.0');
    const installedDep = await makeInstalled('dep', 'file:/dep', '1.0.0');
    const resolvedRoot = await makeResolved('root', 'file:/root', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [logLine('resource_delete', 'root/fieldTypes/a')],
      },
    ]);
    const resolvedDep = await makeResolved('dep', 'file:/dep', '2.0.0', [
      {
        from: '1.0.0',
        to: '2.0.0',
        lines: [logLine('resource_delete', 'dep/fieldTypes/a')],
      },
    ]);

    // Resolver yields roots before transitive dependencies.
    const steps = await planModuleReplays(
      [resolvedRoot, resolvedDep],
      [installedRoot, installedDep],
    );
    expect(steps.map((s) => s.modulePrefix)).toEqual(['dep', 'root']);
  });
});

describe('filterStepsToApplied', () => {
  function bareStep(modulePrefix: string): ReplayStep {
    return {
      modulePrefix,
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      seals: [],
    };
  }

  it('keeps steps whose module applied and drops the rest, preserving order', () => {
    const steps = [bareStep('dep'), bareStep('mid'), bareStep('root')];
    const { executable, dropped } = filterStepsToApplied(steps, [
      'root',
      'dep',
    ]);
    expect(executable.map((s) => s.modulePrefix)).toEqual(['dep', 'root']);
    expect(dropped.map((s) => s.modulePrefix)).toEqual(['mid']);
  });

  it('passes everything through when all modules applied', () => {
    const steps = [bareStep('a'), bareStep('b')];
    const { executable, dropped } = filterStepsToApplied(steps, ['a', 'b']);
    expect(executable).toEqual(steps);
    expect(dropped).toEqual([]);
  });

  it('drops everything when nothing applied', () => {
    const steps = [bareStep('a')];
    const { executable, dropped } = filterStepsToApplied(steps, []);
    expect(executable).toEqual([]);
    expect(dropped).toEqual(steps);
  });
});

describe('executeModuleReplays', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fakeProject() {
    return {
      resources: { changed: vi.fn(), changedModules: vi.fn() },
      cardsCache: { clear: vi.fn() },
      populateCaches: vi.fn().mockResolvedValue(undefined),
    } as unknown as Project;
  }

  function deleteEntry(target: string): ConfigurationLogEntry {
    return {
      timestamp: '2026-01-01T00:00:00.000Z',
      operation: 'resource_delete',
      target,
      parameters: { type: 'fieldTypes' },
    };
  }

  function step(
    modulePrefix: string,
    targets: string[],
    sealFrom = '1.0.0',
    sealTo = '2.0.0',
  ): ReplayStep {
    return {
      modulePrefix,
      fromVersion: sealFrom,
      toVersion: sealTo,
      seals: [
        {
          seal: {
            from: sealFrom,
            to: sealTo,
            fileName: formatSealFileName(sealFrom, sealTo),
          },
          entries: targets.map(deleteEntry),
        },
      ],
    };
  }

  it('applies entries in step order with the replay origin', async () => {
    const applySpy = vi
      .spyOn(ResourceMutations.prototype, 'apply')
      .mockResolvedValue(undefined);
    const project = fakeProject();

    await executeModuleReplays(project, [
      step('dep', ['dep/fieldTypes/a', 'dep/fieldTypes/b']),
      step('root', ['root/fieldTypes/c']),
    ]);

    expect(applySpy).toHaveBeenCalledTimes(3);
    expect(applySpy.mock.calls.map(([input]) => input)).toMatchObject([
      { kind: 'delete', target: { prefix: 'dep', identifier: 'a' } },
      { kind: 'delete', target: { prefix: 'dep', identifier: 'b' } },
      { kind: 'delete', target: { prefix: 'root', identifier: 'c' } },
    ]);
    expect(applySpy.mock.calls.map(([, origin]) => origin)).toEqual([
      { kind: 'replay', modulePrefix: 'dep', cardTypeRenames: new Map() },
      { kind: 'replay', modulePrefix: 'dep', cardTypeRenames: new Map() },
      { kind: 'replay', modulePrefix: 'root', cardTypeRenames: new Map() },
    ]);
  });

  it('refreshes project caches once, after all chains', async () => {
    const applySpy = vi
      .spyOn(ResourceMutations.prototype, 'apply')
      .mockResolvedValue(undefined);
    const project = fakeProject();

    await executeModuleReplays(project, [
      step('dep', ['dep/fieldTypes/a']),
      step('root', ['root/fieldTypes/b']),
    ]);

    const changed = project.resources.changed as ReturnType<typeof vi.fn>;
    const clear = project.cardsCache.clear as ReturnType<typeof vi.fn>;
    const populate = project.populateCaches as ReturnType<typeof vi.fn>;
    expect(changed).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(populate).toHaveBeenCalledTimes(1);
    const lastApplyOrder = Math.max(...applySpy.mock.invocationCallOrder);
    expect(populate.mock.invocationCallOrder[0]).toBeGreaterThan(
      lastApplyOrder,
    );
  });

  it('does nothing for an empty plan', async () => {
    const applySpy = vi.spyOn(ResourceMutations.prototype, 'apply');
    const project = fakeProject();

    await executeModuleReplays(project, []);

    expect(applySpy).not.toHaveBeenCalled();
    expect(project.populateCaches).not.toHaveBeenCalled();
  });

  it('wraps the first failing apply in ModuleReplayFailedError with a 1-based sequence', async () => {
    const boom = new Error('cascade exploded');
    vi.spyOn(ResourceMutations.prototype, 'apply')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(boom);
    const project = fakeProject();

    const error = await executeModuleReplays(project, [
      step('mod', ['mod/fieldTypes/a', 'mod/fieldTypes/b']),
    ]).catch((e) => e);

    expect(error).toBeInstanceOf(ModuleReplayFailedError);
    expect(error.modulePrefix).toBe('mod');
    expect(error.sealFileName).toBe(formatSealFileName('1.0.0', '2.0.0'));
    expect(error.sequence).toBe(2);
    expect(error.cause).toBe(boom);
    expect(error.input).toMatchObject({ kind: 'delete' });
    expect(error.input.target.identifier).toBe('b');
    expect(error.message).toContain('mutation: {"kind":"delete"');
    expect(error.message).toContain('restore the previous state from git');
    expect(project.populateCaches).not.toHaveBeenCalled();
  });

  it('wraps an entry conversion failure in ModuleReplayFailedError', async () => {
    const applySpy = vi.spyOn(ResourceMutations.prototype, 'apply');
    const project = fakeProject();
    const malformed: ConfigurationLogEntry = {
      timestamp: '2026-01-01T00:00:00.000Z',
      operation: 'resource_update',
      target: 'mod/fieldTypes/a',
      // No parameters: entryToMutationInput rejects the entry.
    };

    const error = await executeModuleReplays(project, [
      {
        modulePrefix: 'mod',
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        seals: [
          {
            seal: {
              from: '1.0.0',
              to: '2.0.0',
              fileName: formatSealFileName('1.0.0', '2.0.0'),
            },
            entries: [malformed],
          },
        ],
      },
    ]).catch((e) => e);

    expect(error).toBeInstanceOf(ModuleReplayFailedError);
    expect(error.sequence).toBe(1);
    expect(error.input).toBeUndefined();
    expect(error.message).not.toContain('mutation:');
    expect(applySpy).not.toHaveBeenCalled();
  });
});

describe('ModuleValidationFailedError', () => {
  it('carries a per-module replay summary mapped from the executed steps', () => {
    const steps: ReplayStep[] = [
      {
        modulePrefix: 'dep',
        fromVersion: '1.0.0',
        toVersion: '2.0.0',
        seals: [],
      },
      {
        modulePrefix: 'root',
        fromVersion: '2.1.0',
        toVersion: '3.0.0',
        seals: [],
      },
    ];

    const error = new ModuleValidationFailedError('some validation', steps);

    expect(error.name).toBe('ModuleValidationFailedError');
    expect(error.validationErrors).toBe('some validation');
    expect(error.steps).toEqual([
      { modulePrefix: 'dep', fromVersion: '1.0.0', toVersion: '2.0.0' },
      { modulePrefix: 'root', fromVersion: '2.1.0', toVersion: '3.0.0' },
    ]);
    expect(error.message).toContain('some validation');
    expect(error.message).toContain('replayed dep 1.0.0 → 2.0.0');
    expect(error.message).toContain('replayed root 2.1.0 → 3.0.0');
    expect(error.message).toContain('restore the previous state from git');
  });
});
