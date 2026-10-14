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
import { Cmd, Commands } from '../src/command-handler.js';
import { GitManager } from '../src/utils/git-manager.js';
import {
  makeFakeModuleFixture,
  rewriteFakeModuleFixture,
} from './helpers/module-fixtures.js';
import { mockEnsureModuleListUpToDate } from './helpers/test-utils.js';
import { readJsonFileSync } from '../src/utils/json.js';
import { SCHEMA_VERSION } from '@cyberismo/migrations';
import {
  ModuleReplayFailedError,
  ModuleValidationFailedError,
} from '../src/mutations/replay/replay.js';
import { writeSeals } from './helpers/replay-fixtures.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';
import type { Workspace } from '../src/workspace/workspace.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-modules-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const optionsMini = { projectPath: minimalPath };

describe('import module', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('import module command', () => {
    it('import module and use it (success)', async () => {
      let result = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result.statusCode).toBe(200);

      // Verify that module content can be used to create data.
      await (
        await openTestWorkspace(minimalPath)
      ).resources.create('newCardType', 'cardTypes', {
        workflow: 'decision/workflows/decision',
      });

      // Ensure that module can be updated.
      result = await commandHandler.command(Cmd.updateModules, [], optionsMini);
      expect(result.statusCode).toBe(200);

      // Remove the module so that it won't affect other tests
      await commandHandler.command(
        Cmd.remove,
        ['module', 'decision'],
        optionsMini,
      );
    });
    it('create empty project and import two modules', async () => {
      const prefix = 'proj';
      const name = 'test-project';
      const projectDir = join(testDir, name);
      const testOptions = { projectPath: projectDir };
      const data = await commandHandler.command(
        Cmd.create,
        ['project', name, prefix],
        testOptions,
      );
      expect(data.statusCode).toBe(200);
      let result = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        testOptions,
      );
      expect(result.statusCode).toBe(200);
      result = await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        testOptions,
      );
      expect(result.statusCode).toBe(200);
      result = await commandHandler.command(Cmd.updateModules, [], testOptions);
      expect(result.statusCode).toBe(200);
      result = await commandHandler.command(Cmd.show, ['modules'], testOptions);
      expect(result.statusCode).toBe(200);
      expect(result.payload).toBeDefined();
      const modules = result.payload as Array<{ name: string }>;
      expect(modules.length).toBe(2);
      expect(modules.map((m) => m.name)).toContain('mini');
      expect(modules.map((m) => m.name)).toContain('decision');
    }, 10000);
    it('try to import module - no source', async () => {
      const stubProjectPath = vi
        .spyOn(commandHandler, 'setProjectPath')
        .mockResolvedValue('path');
      const result = await commandHandler.command(
        Cmd.import,
        ['module', ''],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
      stubProjectPath.mockRestore();
    });
    it('try to import module - no destination', async () => {
      const stubProjectPath = vi
        .spyOn(commandHandler, 'setProjectPath')
        .mockResolvedValue('path');
      const invalidOptions = { projectPath: '' };
      await expect(
        commandHandler.command(
          Cmd.import,
          ['module', decisionRecordsPath],
          invalidOptions,
        ),
      ).resolves.toEqual({
        statusCode: 400,
        message: "Input validation error: cannot find project ''",
      });
      stubProjectPath.mockRestore();
    });
    it('re-importing the same module is upsert', async () => {
      // Re-importing a module that is already declared with the same
      // source location must succeed and update the declared range
      // rather than error.
      const result1 = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result1.statusCode).toBe(200);
      const result2 = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(result2.statusCode).toBe(200);
    });
    it('re-importing with a mismatched source location is rejected', async () => {
      // Once a module has been imported from a given source, a re-import
      // of the same module name from a different source must be rejected.
      // The resolver enforces this via `assertSourceAgreement`.
      const firstImport = await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
      expect(firstImport.statusCode).toBe(200);

      // Capture the persisted declaration so we can assert it is not
      // mutated by the failed re-import.
      const configPath = join(
        minimalPath,
        '.cards',
        'local',
        'cardsConfig.json',
      );
      const configBefore = readFileSync(configPath, 'utf-8');

      // Make a sibling copy of the same module fixture at a different
      // path. Same `cardKeyPrefix` ("decision"), different `file:` URL.
      const altModulePath = join(testDir, 'valid/decision-records-alt');
      await copyDir(decisionRecordsPath, altModulePath);

      const result = await commandHandler.command(
        Cmd.import,
        ['module', altModulePath],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
      expect(result.message).toMatch(
        /Conflicting source for module 'decision'/,
      );

      // Config must not have been mutated — the resolver's source-
      // agreement check fires before the applier persists anything.
      const configAfter = readFileSync(configPath, 'utf-8');
      expect(configAfter).toBe(configBefore);
    });
    it('importing from an unreachable git source reports it and redacts credentials', async () => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', 'https://u:secret@127.0.0.1:9/none.git'],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
      expect(result.message).toContain(
        "Couldn't fetch module: 'https://127.0.0.1:9/none.git' is unreachable",
      );
      expect(result.message).not.toContain('secret');
    });
    it('try to import module - that has the same prefix', async () => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to import module - no cardKeyPrefix in cardsConfig.json', async () => {
      const noPrefix = join(testDir, 'fake-no-prefix');
      makeFakeModuleFixture(noPrefix, { cardKeyPrefix: 'placeholder' });
      writeFileSync(
        join(noPrefix, '.cards', 'local', 'cardsConfig.json'),
        JSON.stringify(
          { cardKeyPrefix: '', name: 'noprefix', modules: [], hubs: [] },
          null,
          2,
        ),
      );
      const result = await commandHandler.command(
        Cmd.import,
        ['module', noPrefix],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
      expect(result.message).toContain('cardKeyPrefix');
    });
  });
});

describe('update-modules version arg', () => {
  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('version without module name returns error', async () => {
    const result = await commandHandler.command(
      Cmd.updateModules,
      ['', '1.0.0'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain(
      'A target version can only be specified together with a module name',
    );
  });

  it('version with unknown module name returns error', async () => {
    mockEnsureModuleListUpToDate();
    const result = await commandHandler.command(
      Cmd.updateModules,
      ['nonexistent-module', '1.0.0'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain(
      "Module 'nonexistent-module' is not part of the project",
    );
  });

  it('version not in available list returns error', async () => {
    // Import a local module so it appears in cardsConfig.json, then flip
    // the persisted location to a git URL so the version check is routed
    // through the source layer (which only queries tags for git remotes).
    await commandHandler.command(
      Cmd.import,
      ['module', decisionRecordsPath],
      optionsMini,
    );

    const configPath = join(minimalPath, '.cards', 'local', 'cardsConfig.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const decisionModule = config.modules?.find(
      (m: { name: string }) => m.name === 'decision',
    );
    if (decisionModule) {
      decisionModule.location = 'https://example.com/decision.git';
      writeFileSync(configPath, JSON.stringify(config, null, 4));
    }

    // Force the CommandManager singleton to reload from disk by routing
    // through a different project path first — otherwise the in-memory
    // Project still holds the module location from before the rewrite above.
    await commandHandler.command(Cmd.show, ['modules'], {
      projectPath: decisionRecordsPath,
    });

    mockEnsureModuleListUpToDate();
    // `Modules.update` consults the remote via the source layer, which in
    // turn delegates to `GitManager.listRemoteVersionTags`.
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockResolvedValue([
      '3.0.0',
      '2.0.0',
    ]);

    const result = await commandHandler.command(
      Cmd.updateModules,
      ['decision', '1.0.0'],
      optionsMini,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain("Version '1.0.0' is not available");
    expect(result.message).toContain('2.0.0');
    expect(result.message).toContain('3.0.0');
  });
});

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
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'new-transitive-proj', 'ntrp'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

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
    const handler = new Commands();
    const create = await handler.command(
      Cmd.create,
      ['project', 'backfill-proj', 'bkf'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

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
    const handler = new Commands();
    const create = await handler.command(
      Cmd.create,
      ['project', name, prefix],
      {
        projectPath: projectDir,
      },
    );
    expect(create.statusCode).toBe(200);

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

  it('update reports the replays of a module that failed to apply as skipped', async () => {
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
    expect(JSON.parse(readFileSync(installedConfigPath, 'utf-8')).version).toBe(
      '1.0.0',
    );
  }, 30000);
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

describe('printing module results', () => {
  const projectPath = join(baseDir, 'test-data', 'valid', 'minimal');
  const replayed = {
    modulePrefix: 'm',
    fromVersion: '1.0.0',
    toVersion: '2.0.0',
    seals: 2,
    retired: ['a', 'a'],
    unknown: ['b'],
  };
  const skipped = {
    modulePrefix: 's',
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
  };

  // A dispatcher over a handle whose module operations return `result`.
  function dispatcher(result: object) {
    const modules = {
      install: vi.fn().mockResolvedValue(result),
      update: vi.fn().mockResolvedValue(result),
    };
    const ws = {
      modules,
      clean: { dormantSummary: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Workspace;
    return { handler: new Commands(async () => ws), modules };
  }

  function streams() {
    const spy = (name: 'log' | 'warn' | 'error') =>
      vi.spyOn(console, name).mockImplementation(() => {});
    return { log: spy('log'), warn: spy('warn'), error: spy('error') };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [Cmd.import, ['module', 'x'], true],
    [Cmd.updateModules, ['m'], false],
  ])(
    '%s prints skipped and replayed migrations',
    async (cmd, args, install) => {
      const { handler } = dispatcher({
        replayed: [replayed],
        skippedReplays: [skipped],
        ...(install ? { newValidationErrors: true } : {}),
      });
      const { log, warn, error } = streams();

      const status = await handler.command(cmd, args, { projectPath });

      expect(status.statusCode).toBe(200);
      expect(warn.mock.calls).toEqual([
        [
          "Skipping migration replay for module 's' (1.0.0 -> 1.1.0): the module failed to apply.",
        ],
      ]);
      expect(log.mock.calls).toEqual([
        [
          "Replayed migrations for module 'm': 1.0.0 -> 2.0.0 (2 seal(s)); " +
            'ignored 2 entries for retired operations (a); skipped 1 entry ' +
            'this version does not recognise (b) — upgrade cyberismo to apply it',
        ],
      ]);
      expect(error.mock.calls).toEqual(
        install
          ? [
              [
                'There are new validations errors after importing the module. Check the project',
              ],
            ]
          : [],
      );
    },
  );

  it.each([
    [Cmd.import, ['module', 'x']],
    [Cmd.updateModules, ['m']],
  ])(
    '%s prints what ran before a module error, then fails',
    async (cmd, args) => {
      const result = { replayed: [replayed], skippedReplays: [skipped] };
      const { handler, modules } = dispatcher({});
      const failure = new ModuleValidationFailedError('invalid', [], result);
      modules.install.mockRejectedValue(failure);
      modules.update.mockRejectedValue(failure);
      const { log, warn } = streams();

      const status = await handler.command(cmd, args, { projectPath });

      expect(status.statusCode).toBe(400);
      expect(status.message).toContain('failed validation afterwards');
      expect(warn.mock.calls).toEqual([
        [
          "Skipping migration replay for module 's' (1.0.0 -> 1.1.0): the module failed to apply.",
        ],
      ]);
      expect(log.mock.calls).toHaveLength(1);
      expect(log.mock.calls[0][0]).toMatch(
        /^Replayed migrations for module 'm'/,
      );
    },
  );

  it('prints the skipped replays of an update whose replay failed', async () => {
    const { handler, modules } = dispatcher({});
    const failure = new ModuleReplayFailedError('m', 'seal', 1, 'boom');
    failure.result = { replayed: [], skippedReplays: [skipped] };
    modules.update.mockRejectedValue(failure);
    const { log, warn } = streams();

    const status = await handler.command(Cmd.updateModules, ['m'], {
      projectPath,
    });

    expect(status.statusCode).toBe(400);
    expect(warn.mock.calls).toHaveLength(1);
    expect(log.mock.calls).toEqual([]);
  });

  it.each([
    [[], undefined],
    [[''], undefined],
    [['true'], true],
    [['false'], false],
  ])(
    'import module %j passes the private flag %s',
    async (useCredentials, expected) => {
      const { handler, modules } = dispatcher({
        replayed: [],
        skippedReplays: [],
        newValidationErrors: false,
      });

      await handler.command(Cmd.import, ['module', 'x', ...useCredentials], {
        projectPath,
      });

      expect(modules.install).toHaveBeenCalledWith('x', {
        private: expected,
        credentials: undefined,
        version: undefined,
      });
    },
  );
});
