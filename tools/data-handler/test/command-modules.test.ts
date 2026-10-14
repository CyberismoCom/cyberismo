import { expect, it, describe, beforeEach, afterEach, vi } from 'vitest';

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { copyDir } from '../src/utils/file-utils.js';
import { createProject } from '../src/directory/create-project.js';
import { GitManager } from '../src/utils/git-manager.js';
import {
  makeFakeModuleFixture,
  rewriteFakeModuleFixture,
} from './helpers/module-fixtures.js';
import { mockEnsureModuleListUpToDate } from './helpers/test-utils.js';
import { readJsonFileSync } from '../src/utils/json.js';
import { SCHEMA_VERSION } from '@cyberismo/migrations';
import { writeSeals } from './helpers/replay-fixtures.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;

describe('module update — spec behaviours', () => {
  const moduleTestDir = join(baseDir, 'tmp-command-import-module-update-tests');

  beforeEach(async () => {
    mkdirSync(moduleTestDir, { recursive: true });
    await copyDir('test/test-data', moduleTestDir);
  });

  afterEach(() => {
    rmSync(moduleTestDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('updateAll refreshes allModulePrefixes when a new transitive is pulled in', async () => {
    // When `Modules.updateAll` pulls in a brand-new transitive (because the
    // upstream started declaring a dep it previously did not), the project's
    // cached `allModulePrefixes()` must immediately include that transitive's
    // prefix without any manual refresh by the caller — the applier fires
    // the refresh itself.
    const depRoot = join(moduleTestDir, 'fake-new-dep');
    makeFakeModuleFixture(depRoot, { cardKeyPrefix: 'newdep' });
    const hostRoot = join(moduleTestDir, 'fake-new-host');
    // Host initially declares no transitives.
    makeFakeModuleFixture(hostRoot, {
      cardKeyPrefix: 'newhost',
      modules: [],
    });

    const projectDir = join(moduleTestDir, 'proj-new-transitive');
    await createProject(projectDir, {
      name: 'new-transitive-proj',
      prefix: 'ntrp',
    });

    const ws = await openTestWorkspace(projectDir, {});
    await ws.modules.install(hostRoot);
    // Initially only `newhost` is installed — no `newdep` yet.
    expect(ws.checkout.allModulePrefixes()).toContain('newhost');
    expect(ws.checkout.allModulePrefixes()).not.toContain('newdep');

    // Upstream starts declaring the new transitive.
    rewriteFakeModuleFixture(hostRoot, {
      cardKeyPrefix: 'newhost',
      modules: [{ name: 'newdep', location: `file:${pathResolve(depRoot)}` }],
    });

    await ws.modules.update({});

    // The new transitive is installed on disk...
    expect(existsSync(join(projectDir, '.cards', 'modules', 'newdep'))).toBe(
      true,
    );
    // ...and immediately visible through the cached prefix list without any
    // manual refresh call.
    expect(ws.checkout.allModulePrefixes()).toContain('newdep');
    expect(ws.checkout.allModulePrefixes()).toContain('newhost');
  });

  it('updateAll writes the assumed 1.x into a version-less declaration', async () => {
    // The shim's exit: a legacy declaration (written before version support
    // existed) is converted the next time any module operation runs, even
    // though this module has nowhere to move.
    const projectDir = join(moduleTestDir, 'proj-backfill');
    await createProject(projectDir, { name: 'backfill-proj', prefix: 'bkf' });

    const depRoot = join(moduleTestDir, 'fake-backfill-mod');
    makeFakeModuleFixture(depRoot, { cardKeyPrefix: 'bkfmod' });

    const ws = await openTestWorkspace(projectDir, {
      autoSaveConfiguration: false,
    });
    await ws.modules.install(depRoot);

    // Reshape the persisted declaration into the legacy form: a versioned
    // (git) source with no declared range. Importing from a file source
    // already leaves the range off, so only the location has to change.
    const declaration = ws.checkout.configuration.modules.find(
      (m) => m.name === 'bkfmod',
    );
    expect(declaration).toBeDefined();
    expect(declaration!.version).toBeUndefined();
    declaration!.location = 'https://example.com/bkfmod.git';

    // Seed the installed version so the module resolves to 1.0.0.
    const installedConfigPath = join(
      projectDir,
      '.cards',
      'modules',
      'bkfmod',
      'cardsConfig.json',
    );
    rewriteJson(installedConfigPath, (config) => {
      config.version = '1.0.0';
    });

    mockEnsureModuleListUpToDate();
    // 1.0.0 is the only tag, so the module stays exactly where it is.
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue(['1.0.0']);

    const plan = await ws.modules.planUpdate({});
    expect(plan.rangeWrites).toEqual([{ module: 'bkfmod', range: '1.x' }]);
    await ws.modules.update({});

    const persisted = JSON.parse(
      readFileSync(
        join(projectDir, '.cards', 'local', 'cardsConfig.json'),
        'utf-8',
      ),
    );
    const entry = persisted.modules.find(
      (m: { name: string }) => m.name === 'bkfmod',
    );
    expect(entry.version).toBe('1.x');
    // Still installed at the version it had — this is a declaration-only
    // rewrite, not an update.
    const installed = JSON.parse(readFileSync(installedConfigPath, 'utf-8'));
    expect(installed.version).toBe('1.0.0');
  });

  // --- update replay end to end -------------------------------------
  //
  // File sources expose no remote versions (`listRemoteVersions` → []), and
  // the resolver only pins `resolved.version` from an explicit override or
  // from remote tags — never from the staged cardsConfig. So replay through
  // `Modules.update` for a file source requires the caller's exact-version
  // argument, exactly like the downgrade-conflict test above. The installed
  // version is seeded by hand; the seal ships in the source's migrations/.

  function rewriteJson(
    path: string,
    mutate: (value: Record<string, unknown>) => void,
  ): void {
    const value = JSON.parse(readFileSync(path, 'utf-8'));
    mutate(value);
    writeFileSync(path, JSON.stringify(value, null, 4));
  }

  /**
   * Create a fresh host project, import the decision-records fixture (the
   * private per-test copy under `moduleTestDir`), add a LOCAL card type
   * referencing the module's `decision` workflow, and seed the installed
   * module at version 1.0.0 (the fixture's own config carries no version,
   * and its migrations folder is empty).
   */
  async function seedReplayHost(name: string, prefix: string) {
    const moduleSource = join(moduleTestDir, 'valid', 'decision-records');
    const projectDir = join(moduleTestDir, name);
    await createProject(projectDir, { name: name, prefix: prefix });

    const ws = await openTestWorkspace(projectDir, {});
    await ws.modules.install(moduleSource);

    await ws.resources.create(`${prefix}/cardTypes/consumer`, 'cardTypes', {
      workflow: 'decision/workflows/decision',
    });

    const installedConfigPath = join(
      projectDir,
      '.cards',
      'modules',
      'decision',
      'cardsConfig.json',
    );
    rewriteJson(installedConfigPath, (config) => {
      config.version = '1.0.0';
    });

    return { moduleSource, projectDir, ws, installedConfigPath };
  }

  /**
   * Turn the SOURCE fixture into its 2.0.0 release: bump the config version
   * and write one seal covering (0.0.0, 2.0.0] with the given released-format
   * log lines. Callers apply the matching resource changes themselves so
   * the source tree stays self-consistent (upstream already migrated).
   */
  function sealSourceRelease(moduleSource: string, lines: string[]): void {
    const sourceLocal = join(moduleSource, '.cards', 'local');
    rewriteJson(join(sourceLocal, 'cardsConfig.json'), (config) => {
      config.version = '2.0.0';
    });
    writeSeals(join(sourceLocal, 'migrations'), [
      { from: '0.0.0', to: '2.0.0', lines },
    ]);
  }

  it('refuses an update whose source changed its prefix', async () => {
    const { moduleSource, projectDir, ws, installedConfigPath } =
      await seedReplayHost('replay-renamed-proj', 'rren');

    // Upstream 2.0.0 renamed its own prefix. A prefix is the module's
    // identity, so this is a different module and the update is refused.
    rewriteJson(
      join(moduleSource, '.cards', 'local', 'cardsConfig.json'),
      (c) => {
        c.cardKeyPrefix = 'decrec';
      },
    );
    sealSourceRelease(moduleSource, []);

    await expect(
      ws.modules.update({ module: 'decision', version: '2.0.0' }),
    ).rejects.toThrow(/Module 'decision' now declares the prefix 'decrec'/);

    // Nothing moved: the installation is still there at its old version.
    expect(JSON.parse(readFileSync(installedConfigPath, 'utf-8')).version).toBe(
      '1.0.0',
    );
    expect(existsSync(join(projectDir, '.cards', 'modules', 'decrec'))).toBe(
      false,
    );
  }, 30000);

  // Windows ignores the read-only chmod that makes the apply fail.
  it.skipIf(process.platform === 'win32')(
    'update reports the replays of a module that failed to apply as skipped',
    async () => {
      const { moduleSource, projectDir, ws, installedConfigPath } =
        await seedReplayHost('replay-skipped-proj', 'rskp');
      sealSourceRelease(moduleSource, []);

      // The installed module cannot be swapped out of a read-only folder.
      const modulesFolder = join(projectDir, '.cards', 'modules');
      chmodSync(modulesFolder, 0o555);
      try {
        expect(
          await ws.modules.update({ module: 'decision', version: '2.0.0' }),
        ).toEqual({
          replayed: [],
          skippedReplays: [
            {
              modulePrefix: 'decision',
              fromVersion: '1.0.0',
              toVersion: '2.0.0',
            },
          ],
        });
      } finally {
        chmodSync(modulesFolder, 0o755);
      }
      expect(
        JSON.parse(readFileSync(installedConfigPath, 'utf-8')).version,
      ).toBe('1.0.0');
    },
    30000,
  );
});

describe('module schema version enforcement on import', () => {
  const schemaTestDir = join(baseDir, 'tmp-import-schema-tests');
  const hostPath = join(schemaTestDir, 'valid/minimal');
  const modulePath = join(schemaTestDir, 'valid/decision-records');
  const moduleConfigPath = join(
    modulePath,
    '.cards',
    'local',
    'cardsConfig.json',
  );
  const installedConfigPath = join(
    hostPath,
    '.cards',
    'modules',
    'decision',
    'cardsConfig.json',
  );

  function setModuleSchemaVersion(version: number | undefined) {
    const config = readJsonFileSync(moduleConfigPath) as Record<
      string,
      unknown
    >;
    if (version === undefined) {
      delete config.schemaVersion;
    } else {
      config.schemaVersion = version;
    }
    writeFileSync(moduleConfigPath, JSON.stringify(config, null, 4));
  }

  beforeEach(async () => {
    rmSync(schemaTestDir, { recursive: true, force: true });
    mkdirSync(schemaTestDir, { recursive: true });
    await copyDir('test/test-data', schemaTestDir);
    mockEnsureModuleListUpToDate();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(schemaTestDir, { recursive: true, force: true });
  });

  it('migrates an older module before installing it', async () => {
    setModuleSchemaVersion(4);
    const ws = await openTestWorkspace(hostPath);
    await ws.modules.install(modulePath);
    const installed = readJsonFileSync(installedConfigPath) as {
      schemaVersion: number;
    };
    expect(installed.schemaVersion).toBe(SCHEMA_VERSION);
    ws.checkout.dispose();
  });
});
