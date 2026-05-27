import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Project } from '../../src/containers/project.js';
import {
  ModuleReplayConflictError,
  ModuleValidationFailedError,
  replayResolvedUpdates,
  snapshotInstalledVersions,
} from '../../src/modules/replay-updates.js';
import { copyDir } from '../../src/utils/file-utils.js';
import type { ResolvedModule } from '../../src/modules/resolver.js';
import { toVersion } from '../../src/modules/types.js';

const FIXTURE_PATH = join(
  import.meta.dirname,
  '..',
  'test-data',
  'valid',
  'minimal',
);
const tmpDir = join(import.meta.dirname, 'tmp-replay-updates');

function fakeResolved(prefix: string, version?: string): ResolvedModule {
  return {
    declaration: {
      project: '/unused',
      name: prefix,
      source: { location: `file:/unused/${prefix}`, private: false },
      versionRange: undefined,
      parent: undefined,
    },
    remoteUrl: `file:/unused/${prefix}`,
    stagedPath: '/unused',
    version: version === undefined ? undefined : toVersion(version),
  };
}

async function seedInstalledModule(
  projectPath: string,
  prefix: string,
  options: { version?: string; sealedVersions?: string[] },
): Promise<void> {
  const moduleFolder = join(projectPath, '.cards', 'modules', prefix);
  await mkdir(join(moduleFolder, 'migrations'), { recursive: true });
  if (options.version) {
    await writeFile(
      join(moduleFolder, 'cardsConfig.json'),
      JSON.stringify({
        cardKeyPrefix: prefix,
        name: prefix,
        version: options.version,
        modules: [],
      }),
    );
  }
  for (const v of options.sealedVersions ?? []) {
    await writeFile(
      join(moduleFolder, 'migrations', `migrationLog_${v}.jsonl`),
      '',
    );
  }
}

describe('snapshotInstalledVersions', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reads each resolved module’s prior version from disk', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', { version: '1.0.0' });
    await seedInstalledModule(projectPath, 'shared/bar', { version: '2.4.1' });

    const snapshot = await snapshotInstalledVersions(project, [
      fakeResolved('shared/foo', '1.1.0'),
      fakeResolved('shared/bar', '2.5.0'),
    ]);

    expect(snapshot.get('shared/foo')).toBe('1.0.0');
    expect(snapshot.get('shared/bar')).toBe('2.4.1');
  });

  it('maps bootstrap installs (no prior cardsConfig.json) to null', async () => {
    const snapshot = await snapshotInstalledVersions(project, [
      fakeResolved('shared/brand-new', '1.0.0'),
    ]);
    expect(snapshot.get('shared/brand-new')).toBeNull();
  });
});

describe('replayResolvedUpdates', () => {
  let project: Project;
  let projectPath: string;

  beforeEach(async () => {
    projectPath = join(tmpDir, `proj-${Date.now()}-${Math.random()}`);
    await mkdir(projectPath, { recursive: true });
    await copyDir(FIXTURE_PATH, projectPath);
    project = new Project(projectPath);
    await project.populateCaches();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when nothing changed version (pure re-resolve)', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', {
      version: '1.0.0',
      sealedVersions: ['1.0.0'],
    });
    const fromVersionByPrefix = new Map([['shared/foo', '1.0.0']]);

    const result = await replayResolvedUpdates(
      project,
      [fakeResolved('shared/foo', '1.0.0')],
      fromVersionByPrefix,
    );

    expect(result).toBeNull();
  });

  it('returns null when every resolved entry is unversioned', async () => {
    const result = await replayResolvedUpdates(
      project,
      [fakeResolved('shared/foo' /* no version */)],
      new Map(),
    );
    expect(result).toBeNull();
  });

  it('skips bootstrap entries (no prior version on disk) — installed state already reflects the target version', async () => {
    // A freshly-installed module's resources already reflect the post-
    // migration state of `toVersion`; replaying the v1.0.0 log against it
    // would double-apply (e.g. re-adding a customField that's already
    // there). Bootstrap entries must contribute no replay step.
    await seedInstalledModule(projectPath, 'shared/foo', {
      sealedVersions: ['1.0.0'],
    });

    const result = await replayResolvedUpdates(
      project,
      [fakeResolved('shared/foo', '1.0.0')],
      new Map([['shared/foo', null]]),
    );

    expect(result).toBeNull();
  });

  it('runs preview + apply for entries whose version changed (empty seals succeed)', async () => {
    await seedInstalledModule(projectPath, 'shared/foo', {
      version: '1.0.0',
      sealedVersions: ['1.0.0', '1.1.0'],
    });
    const fromVersionByPrefix = new Map([['shared/foo', '1.0.0']]);

    const result = await replayResolvedUpdates(
      project,
      [fakeResolved('shared/foo', '1.1.0')],
      fromVersionByPrefix,
    );

    expect(result?.status).toBe('succeeded');
    expect(result?.steps).toHaveLength(1);
    expect(result?.steps[0]).toMatchObject({
      modulePrefix: 'shared/foo',
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
    });
  });

  it('throws ModuleReplayConflictError when the preview reports a diverged branch', async () => {
    // 1.6.0 carries breaking changes that 2.0.0 was not built against —
    // detectMigrationPathConflicts flags this as migration_path_unreachable.
    await seedInstalledModule(projectPath, 'shared/foo', {
      version: '1.6.0',
      sealedVersions: ['1.5.0', '1.6.0', '2.0.0'],
    });
    const fromVersionByPrefix = new Map([['shared/foo', '1.6.0']]);

    let caught: unknown;
    try {
      await replayResolvedUpdates(
        project,
        [fakeResolved('shared/foo', '2.0.0')],
        fromVersionByPrefix,
        { module: 'shared/foo' },
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ModuleReplayConflictError);
    const err = caught as ModuleReplayConflictError;
    expect(err.module).toBe('shared/foo');
    expect(err.conflicts.length).toBeGreaterThan(0);
    expect(err.message).toMatch(/Cannot update shared\/foo:/);
  });
});

describe('ModuleValidationFailedError', () => {
  it('carries the error lines and module, and renders them in the message', () => {
    const err = new ModuleValidationFailedError(['problem A', 'problem B'], 'shared/foo');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ModuleValidationFailedError');
    expect(err.validationErrors).toEqual(['problem A', 'problem B']);
    expect(err.module).toBe('shared/foo');
    expect(err.message).toMatch(/Module update for shared\/foo left the project invalid: problem A; problem B/);
  });

  it('omits the module name when none is given', () => {
    const err = new ModuleValidationFailedError(['x']);
    expect(err.message).toMatch(/^Module update left the project invalid: x$/);
  });
});
