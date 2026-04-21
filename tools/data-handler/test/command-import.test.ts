import {
  expect,
  it,
  describe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';

import { CommandManager } from '../src/command-manager.js';
import { copyDir } from '../src/utils/file-utils.js';
import { Cmd, Commands } from '../src/command-handler.js';
import { Fetch, Show } from '../src/commands/index.js';
import { GitManager } from '../src/utils/git-manager.js';
import type { SourceLayer } from '../src/modules/source.js';
import {
  getTestProject,
  mockEnsureModuleListUpToDate,
} from './helpers/test-utils.js';

// Create test artifacts in a temp folder.
const baseDir = import.meta.dirname;
const testDir = join(baseDir, 'tmp-command-handler-import-tests');

const decisionRecordsPath = join(testDir, 'valid/decision-records');
const minimalPath = join(testDir, 'valid/minimal');

const commandHandler: Commands = new Commands();
const optionsMini = { projectPath: minimalPath };
const options = { projectPath: decisionRecordsPath };

describe('import csv command', () => {
  beforeAll(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data', testDir);
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('import csv file (success)', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv')],
      options,
    );
    expect(result.statusCode).toBe(200);

    const [key1, key2] = result.payload as string[];

    const project = getTestProject(decisionRecordsPath);
    await project.populateCaches();
    const fetchCmd = new Fetch(project);
    const show = new Show(project, fetchCmd);
    const card1 = await show.showCardDetails(key1);
    const card2 = await show.showCardDetails(key2);
    expect(card1.metadata!.title).toBe('Title1');
    expect(card1.content).toBe('content1');
    expect(card1.metadata!.labels).toEqual([
      'template-test-label',
      'label-first',
      'label-second',
    ]);
    expect(card1.metadata!['decision/fieldTypes/responsible']).toBe(
      'responsible@email.com',
    );
    expect(card1.metadata!.doesnotexist).toBeUndefined();
    expect(card2.metadata!.title).toBe('Title2');
    expect(card2.content).toBe('content2');
    // no labels specified, takes them from the template
    expect(card2.metadata!.labels).toEqual(['template-test-label']);
    expect(card2.metadata!['decision/fieldTypes/responsible']).toBe('');
    expect(card2.metadata!.doesnotexist).toBeUndefined();
  });
  it('import csv file with parent (success)', async () => {
    const parent = 'decision_6';
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'valid-real.csv'), parent],
      options,
    );
    expect(result.statusCode).toBe(200);

    const createdKeys = result.payload as string[];
    // Use command handler to get card details for consistent project instance
    const parentCardResult = await commandHandler.command(
      Cmd.show,
      ['card', parent],
      { ...options, details: true },
    );
    expect(parentCardResult.statusCode).toBe(200);
    type ParentCard = { children?: string[] };
    const parentCard = parentCardResult.payload as ParentCard;

    expect(createdKeys).toHaveLength(2);
    expect(parentCard.children).toContain(createdKeys[0]);
    expect(parentCard.children).toContain(createdKeys[1]);
  });
  it('try to import csv file without all required columns', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', join(testDir, 'invalid-missing-columns-real.csv')],
      options,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('requires property "template"');
  });
  it('try to import csv file with invalid path', async () => {
    const result = await commandHandler.command(
      Cmd.import,
      ['csv', 'i-dont-exist.csv'],
      options,
    );
    expect(result.statusCode).toBe(400);
    expect(result.message).toContain('ENOENT');
  });
});

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
      result = await commandHandler.command(
        Cmd.create,
        ['cardType', 'newCardType', 'decision/workflows/decision'],
        optionsMini,
      );
      expect(result.statusCode).toBe(200);

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
      if (result.payload) {
        const modules = result.payload as Array<{ name: string }>;
        expect(modules.length).toBe(2);
        expect(modules.map((m) => m.name)).toContain('mini');
        expect(modules.map((m) => m.name)).toContain('decision');
      }
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
    it('re-importing the same module is upsert (spec ImportModule)', async () => {
      // Spec: `ImportModule` is upsert. Re-importing a module that is
      // already declared with the same source location must succeed and
      // update the declared range rather than error.
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
      // Spec invariant `DeclarationAndInstallationAgreeOnSource`: once a
      // module has been imported from a given source, a re-import of the
      // same module name from a different source must be rejected. The
      // resolver enforces this via `assertSourceAgreement`.
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
      // agreement check fires before the installer persists anything.
      const configAfter = readFileSync(configPath, 'utf-8');
      expect(configAfter).toBe(configBefore);
    });
    it('try to import module - that has the same prefix', async () => {
      const result = await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
  });

  describe('modifying imported module content is forbidden', () => {
    beforeAll(async () => {
      await commandHandler.command(
        Cmd.import,
        ['module', minimalPath],
        options,
      );
      await commandHandler.command(
        Cmd.import,
        ['module', decisionRecordsPath],
        optionsMini,
      );
    });
    it('try to add card to module template', async () => {
      const templateName = 'mini/templates/test-template';
      const cardType = 'decision/cardTypes/decision';
      const cardKey = '';
      const result = await commandHandler.command(
        Cmd.add,
        ['card', templateName, cardType, cardKey],
        options,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to add child card to a module card', async () => {
      const templateName = 'decision/templates/decision';
      const cardType = 'decision/cardTypes/decision';
      const cardKey = 'decision_2';
      // try to add new card to decision_2 when 'decision-records' has been imported to 'minimal'
      const result = await commandHandler.command(
        Cmd.add,
        ['card', templateName, cardType, cardKey],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to create attachment to a module card', async () => {
      const attachmentPath = join(testDir, 'attachments/the-needle.heic');
      const cardKey = 'decision_2';
      const result = await commandHandler.command(
        Cmd.create,
        ['attachment', cardKey, attachmentPath],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });

    it('try to move a module card to another template', async () => {
      const moduleCardKey = 'decision_2';
      const templateCardKey = 'decision_1';
      const result = await commandHandler.command(
        Cmd.move,
        [templateCardKey, moduleCardKey, 'root'],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove card from a module template', async () => {
      const cardKey = 'decision_2';
      const result = await commandHandler.command(
        Cmd.remove,
        ['card', cardKey],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove cardType from a module', async () => {
      const cardType = 'decision/cardTypes/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['cardType', cardType],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove fieldType from a module', async () => {
      const fieldType = 'decision/fieldTypes/finished';
      const result = await commandHandler.command(
        Cmd.remove,
        ['fieldType', fieldType],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove report from a module', async () => {
      const report = 'decision/reports/testReport';
      const result = await commandHandler.command(
        Cmd.remove,
        ['report', report],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove template from a module', async () => {
      const template = 'decision/templates/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['template', template],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove workflow from a module', async () => {
      const workflow = 'decision/workflows/decision';
      const result = await commandHandler.command(
        Cmd.remove,
        ['workflow', workflow],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
    });
    it('try to remove attachment from a module card', async () => {
      const cardKey = 'decision_1';
      const attachment = 'the-needle.heic';
      const result = await commandHandler.command(
        Cmd.remove,
        ['attachment', cardKey, attachment],
        optionsMini,
      );
      expect(result.statusCode).toBe(400);
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
    // Project still holds the pre-hack module location.
    await commandHandler.command(Cmd.show, ['project'], {
      projectPath: decisionRecordsPath,
    });

    mockEnsureModuleListUpToDate();
    // `updateModule` consults the remote via the source layer, which in
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

// The previous `import module version resolution` suite lived here and
// exercised `Import.importModule` by spying on `ModuleManager.prototype`
// private methods (importGitModule, updateDependencies,
// listAvailableVersions, readModuleVersion). After Phase 8 the orchestration
// moved into `modules/resolver.ts` and `modules/installer.ts`; those private
// methods no longer exist. Per-layer coverage of version resolution
// (resolver picks highest satisfying tag, override respected, no-match
// throws) is the job of Phase 10's `modules/resolver.test.ts` and is
// intentionally omitted here to avoid coupling integration tests to
// implementation details.

// ---------------------------------------------------------------------------
// Spec-driven integration tests for `Import.updateModule` and the
// diamond-conflict / orphan cascade behaviours wired in Phases 5-8. Each
// test sets up a real `CommandManager` against a project and drives the
// command layer — no prototype spies on deleted private methods.
// ---------------------------------------------------------------------------
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

  /**
   * Build a synthetic module fixture on disk that `Import.importModule`
   * accepts as a `file:` source. The minimum a file-source module needs is
   * a valid `.cards/local/cardsConfig.json`; optional `modules[]` entries
   * declare transitive deps that the resolver walks.
   */
  function makeFakeModuleFixture(
    root: string,
    config: {
      cardKeyPrefix: string;
      name?: string;
      modules?: Array<{ name: string; location: string; version?: string }>;
    },
  ): string {
    const localDir = join(root, '.cards', 'local');
    mkdirSync(localDir, { recursive: true });
    // `cardRoot/` is what `Project.isCreated` looks for; the resolver never
    // touches it, but having it lets the `Validate.validateFolder` +
    // `pathExists` precondition in `importModule` sail through cleanly.
    mkdirSync(join(root, 'cardRoot'), { recursive: true });
    writeFileSync(
      join(localDir, 'cardsConfig.json'),
      JSON.stringify(
        {
          cardKeyPrefix: config.cardKeyPrefix,
          name: config.name ?? config.cardKeyPrefix,
          description: '',
          modules: config.modules ?? [],
          hubs: [],
        },
        null,
        2,
      ),
    );
    return root;
  }

  /**
   * Rewrite a fake module fixture's `cardsConfig.json`. Used to simulate
   * a module upstream dropping a transitive dependency between imports —
   * the trigger for `cleanOrphans` during `updateAllModules`.
   */
  function rewriteFakeModuleFixture(
    root: string,
    config: {
      cardKeyPrefix: string;
      name?: string;
      modules?: Array<{ name: string; location: string; version?: string }>;
    },
  ): void {
    writeFileSync(
      join(root, '.cards', 'local', 'cardsConfig.json'),
      JSON.stringify(
        {
          cardKeyPrefix: config.cardKeyPrefix,
          name: config.name ?? config.cardKeyPrefix,
          description: '',
          modules: config.modules ?? [],
          hubs: [],
        },
        null,
        2,
      ),
    );
  }

  it('updateAllModules cleans up installations orphaned by a dropped transitive dep', async () => {
    // Build two fake modules: `host` (top-level) declares `dep`
    // (transitive). Import host → dep is installed transitively. Edit
    // host's fixture to drop dep, then run updateAllModules. After the
    // orphan cascade, .cards/modules/dep/ must be gone.
    const depRoot = join(moduleTestDir, 'fake-dep');
    makeFakeModuleFixture(depRoot, { cardKeyPrefix: 'fkdep' });
    const hostRoot = join(moduleTestDir, 'fake-host');
    makeFakeModuleFixture(hostRoot, {
      cardKeyPrefix: 'fkhost',
      modules: [{ name: 'fkdep', location: `file:${pathResolve(depRoot)}` }],
    });

    const projectDir = join(moduleTestDir, 'proj-orphan');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'orphan-proj', 'orph'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    await commands.importCmd.importModule(hostRoot, projectDir);

    const installedHost = join(projectDir, '.cards', 'modules', 'fkhost');
    const installedDep = join(projectDir, '.cards', 'modules', 'fkdep');
    expect(existsSync(installedHost)).toBe(true);
    expect(existsSync(installedDep)).toBe(true);

    // Upstream drops its transitive dep.
    rewriteFakeModuleFixture(hostRoot, {
      cardKeyPrefix: 'fkhost',
      modules: [],
    });

    await commands.importCmd.updateAllModules();

    // host is still around; dep must have been removed by the fixed-point
    // orphan cascade that runs at the end of UpdateModules.
    expect(existsSync(installedHost)).toBe(true);
    expect(existsSync(installedDep)).toBe(false);
  });

  it('updateAllModules refreshes allModulePrefixes when a new transitive is pulled in', async () => {
    // Phase C regression guard: when `updateAllModules` pulls in a brand-new
    // transitive (because the upstream started declaring a dep it previously
    // did not), the project's cached `allModulePrefixes()` must immediately
    // include that transitive's prefix without any manual refresh by the
    // caller. The installer now fires the refresh itself.
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

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    await commands.importCmd.importModule(hostRoot, projectDir);
    // Initially only `newhost` is installed — no `newdep` yet.
    expect(commands.project.allModulePrefixes()).toContain('newhost');
    expect(commands.project.allModulePrefixes()).not.toContain('newdep');

    // Upstream starts declaring the new transitive.
    rewriteFakeModuleFixture(hostRoot, {
      cardKeyPrefix: 'newhost',
      modules: [{ name: 'newdep', location: `file:${pathResolve(depRoot)}` }],
    });

    await commands.importCmd.updateAllModules();

    // The new transitive is installed on disk...
    expect(
      existsSync(join(projectDir, '.cards', 'modules', 'newdep')),
    ).toBe(true);
    // ...and immediately visible through the cached prefix list without any
    // manual refresh call.
    expect(commands.project.allModulePrefixes()).toContain('newdep');
    expect(commands.project.allModulePrefixes()).toContain('newhost');
  });

  it('updateModule with an override version that violates the declared range throws', async () => {
    // Spec: the `update <name> <exact-version>` path must refuse a
    // version that contradicts the declared range. Implemented via
    // `validateVersionAgainstConstraints` in `Import.updateModule`.
    const projectDir = join(moduleTestDir, 'proj-override-bad');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'override-bad-proj', 'ovb'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const depRoot = join(moduleTestDir, 'fake-override-mod');
    makeFakeModuleFixture(depRoot, { cardKeyPrefix: 'ovmod' });

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
    await commands.importCmd.importModule(depRoot, projectDir);

    // Synthesise a declared range on the persisted module so the
    // constraint-validation path fires. The caller-supplied override
    // `2.0.0` violates `^1.0.0`.
    const modSetting = commands.project.configuration.modules.find(
      (m) => m.name === 'ovmod',
    );
    expect(modSetting).toBeDefined();
    modSetting!.version = '^1.0.0';

    await expect(
      commands.importCmd.updateModule('ovmod', undefined, '2.0.0'),
    ).rejects.toThrow(/does not satisfy constraint '\^1\.0\.0'/);
  });

  it('updateModule with an override version inside the declared range succeeds', async () => {
    // Paired positive case for the override flow: `1.3.0` satisfies
    // `^1.0.0`, so the constraint check passes and the install path
    // completes end-to-end against a file source (which ignores the ref
    // but still exercises the two-phase install).
    const projectDir = join(moduleTestDir, 'proj-override-ok');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'override-ok-proj', 'ovk'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const depRoot = join(moduleTestDir, 'fake-override-mod-ok');
    makeFakeModuleFixture(depRoot, { cardKeyPrefix: 'ovkmod' });

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
    await commands.importCmd.importModule(depRoot, projectDir);

    const modSetting = commands.project.configuration.modules.find(
      (m) => m.name === 'ovkmod',
    );
    expect(modSetting).toBeDefined();
    modSetting!.version = '^1.0.0';

    // No throw: constraint check passes, file source fetch/install runs
    // end-to-end. The persisted range stays at `^1.0.0` — the installer
    // only writes back the declared range, never the resolved tag.
    await commands.importCmd.updateModule('ovkmod', undefined, '1.3.0');

    const after = commands.project.configuration.modules.find(
      (m) => m.name === 'ovkmod',
    );
    // The persisted range is semver-normalised by `toVersionRange`, so
    // compare via satisfies semantics: `^1.0.0` and its normalised form
    // `>=1.0.0 <2.0.0-0` are the same range. The important assertion is
    // that the range remained a `^1.0.0`-style range (not `=1.3.0`).
    expect(after?.version).toBeDefined();
    expect(after?.version).toMatch(/1\.0\.0/);
    expect(after?.version).not.toBe('1.3.0');
    expect(existsSync(join(projectDir, '.cards', 'modules', 'ovkmod'))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Resolver-driven diamond-conflict integration tests. These exercise the
// real resolver + installer against an in-memory SourceLayer — end-to-end
// across every module layer (types / source / inventory / resolver /
// installer / orphans) and against a real `Project`, matching what
// `Import.importModule` does internally. We use the same `onConflict`
// wrapper that the command layer uses so the wiring is exercised too.
// ---------------------------------------------------------------------------
describe('import module — transitive diamond conflicts', () => {
  const diamondTestDir = join(baseDir, 'tmp-command-import-diamond-tests');

  beforeEach(async () => {
    mkdirSync(diamondTestDir, { recursive: true });
    await copyDir('test/test-data', diamondTestDir);
  });

  afterEach(() => {
    rmSync(diamondTestDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('diamond with compatible ranges resolves without a warning and installs once', async () => {
    // A and C both declare B at `^1.0.0`; the resolver dedups silently,
    // no DiamondVersionConflict is emitted, and the command-level
    // `onConflict` → console.warn wrapper is never invoked.
    const { createResolver, createInstaller } =
      await import('../src/modules/index.js');
    const { cleanOrphans } = await import('../src/modules/orphans.js');
    const { toVersionRange } = await import('../src/modules/types.js');
    const { mkdir, writeFile } = await import('node:fs/promises');

    const projectDir = join(diamondTestDir, 'proj-diamond-ok');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'diamond-ok-proj', 'dok'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    const locations = {
      A: 'https://example.test/A.git',
      B: 'https://example.test/B.git',
      C: 'https://example.test/C.git',
    } as const;

    const configs = new Map<
      string,
      {
        cardKeyPrefix: string;
        name: string;
        modules: Array<{
          name: string;
          location: string;
          version?: string;
        }>;
      }
    >([
      [
        locations.A,
        {
          cardKeyPrefix: 'A',
          name: 'A',
          modules: [{ name: 'B', location: locations.B, version: '^1.0.0' }],
        },
      ],
      [
        locations.C,
        {
          cardKeyPrefix: 'C',
          name: 'C',
          modules: [{ name: 'B', location: locations.B, version: '^1.0.0' }],
        },
      ],
      [locations.B, { cardKeyPrefix: 'B', name: 'B', modules: [] }],
    ]);
    const availableByLocation = new Map<string, string[]>([
      [locations.A, ['1.0.0']],
      [locations.C, ['1.0.0']],
      [locations.B, ['1.2.0', '1.0.0']],
    ]);

    // In-memory SourceLayer: `fetch` materialises a synthetic resource
    // tree under tempDir so the installer can copy from it; listTags /
    // queryRemote serve the resolver's version picks.
    const source: SourceLayer = {
      async fetch(target, destRoot, nameHint) {
        const dir = join(destRoot, nameHint);
        await mkdir(join(dir, '.cards', 'local'), { recursive: true });
        const cfg = configs.get(target.location);
        if (!cfg) throw new Error(`no fake config for ${target.location}`);
        await writeFile(
          join(dir, '.cards', 'local', 'cardsConfig.json'),
          JSON.stringify(cfg),
        );
        return dir;
      },
      async listRemoteVersions(location) {
        return availableByLocation.get(location) ?? [];
      },
      async queryRemote() {
        return { reachable: true };
      },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tempDir = join(projectDir, '.temp', 'modules');
    const rootA = {
      project: commands.project.basePath,
      name: 'A',
      source: { location: locations.A, private: false },
      versionRange: toVersionRange('^1.0.0'),
      parent: undefined,
    };
    const rootC = {
      project: commands.project.basePath,
      name: 'C',
      source: { location: locations.C, private: false },
      versionRange: toVersionRange('^1.0.0'),
      parent: undefined,
    };

    const resolver = createResolver(source);
    const installer = createInstaller(source);
    const resolved = await resolver.resolve([rootA, rootC], {
      tempDir,
      onConflict: (event) => {
        // Mirror the command-layer wrapper — a conflict here would mean
        // the dedup silent-path is broken.
        console.warn(`Diamond version conflict for module '${event.name}'`);
      },
    });
    await installer.install(commands.project, resolved, { tempDir });
    await cleanOrphans(commands.project);

    // B appears exactly once in the resolved plan.
    const bEntries = resolved.filter((r) => r.declaration.name === 'B');
    expect(bEntries).toHaveLength(1);
    expect(bEntries[0].version).toBe('1.2.0');

    // B on disk exactly once.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);

    // No diamond-conflict warn was produced.
    const diamondWarns = warnSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string'
        ? call[0].includes('Diamond version conflict')
        : false,
    );
    expect(diamondWarns).toHaveLength(0);
  });

  it('diamond with incompatible ranges warns, keeps first-encountered, does not throw', async () => {
    // A declares B^1.0, C declares B^2.0. Spec: first-encounter wins on
    // dedup, later mismatched ranges surface as a `DiamondVersionConflict`
    // warning, not a throw.
    const { createResolver, createInstaller } =
      await import('../src/modules/index.js');
    const { cleanOrphans } = await import('../src/modules/orphans.js');
    const { toVersionRange } = await import('../src/modules/types.js');
    const { mkdir, writeFile } = await import('node:fs/promises');

    const projectDir = join(diamondTestDir, 'proj-diamond-bad');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'diamond-bad-proj', 'dbd'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    const locations = {
      A: 'https://example.test/A.git',
      B: 'https://example.test/B.git',
      C: 'https://example.test/C.git',
    } as const;

    const configs = new Map<
      string,
      {
        cardKeyPrefix: string;
        name: string;
        modules: Array<{
          name: string;
          location: string;
          version?: string;
        }>;
      }
    >([
      [
        locations.A,
        {
          cardKeyPrefix: 'A',
          name: 'A',
          modules: [{ name: 'B', location: locations.B, version: '^1.0.0' }],
        },
      ],
      [
        locations.C,
        {
          cardKeyPrefix: 'C',
          name: 'C',
          modules: [{ name: 'B', location: locations.B, version: '^2.0.0' }],
        },
      ],
      [locations.B, { cardKeyPrefix: 'B', name: 'B', modules: [] }],
    ]);
    const availableByLocation = new Map<string, string[]>([
      [locations.A, ['1.0.0']],
      [locations.C, ['1.0.0']],
      [locations.B, ['2.0.0', '1.5.0']],
    ]);

    const source: SourceLayer = {
      async fetch(target, destRoot, nameHint) {
        const dir = join(destRoot, nameHint);
        await mkdir(join(dir, '.cards', 'local'), { recursive: true });
        const cfg = configs.get(target.location);
        if (!cfg) throw new Error(`no fake config for ${target.location}`);
        await writeFile(
          join(dir, '.cards', 'local', 'cardsConfig.json'),
          JSON.stringify(cfg),
        );
        return dir;
      },
      async listRemoteVersions(location) {
        return availableByLocation.get(location) ?? [];
      },
      async queryRemote() {
        return { reachable: true };
      },
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const tempDir = join(projectDir, '.temp', 'modules');
    const rootA = {
      project: commands.project.basePath,
      name: 'A',
      source: { location: locations.A, private: false },
      versionRange: toVersionRange('^1.0.0'),
      parent: undefined,
    };
    const rootC = {
      project: commands.project.basePath,
      name: 'C',
      source: { location: locations.C, private: false },
      versionRange: toVersionRange('^1.0.0'),
      parent: undefined,
    };

    const resolver = createResolver(source);
    const installer = createInstaller(source);

    // Must not throw — spec mandates first-encounter wins and a warning.
    const resolved = await resolver.resolve([rootA, rootC], {
      tempDir,
      onConflict: (event) => {
        // Replicate the exact wrapper used by `Import.importModule`.
        const installedDesc =
          event.installedVersion.kind === 'pinned'
            ? `installed version ${event.installedVersion.value}`
            : `default branch (no version pinned)`;
        console.warn(
          `Diamond version conflict for module '${event.name}': ` +
            `${installedDesc} ` +
            `does not satisfy range '${event.rejectingRange}' ` +
            `(required by ${event.rejectingParent?.name ?? '<unknown parent>'})`,
        );
      },
    });
    await installer.install(commands.project, resolved, { tempDir });
    await cleanOrphans(commands.project);

    // B installed exactly once at the first-encountered range (^1.0.0 →
    // 1.5.0, the max satisfying tag on the fake remote). The rejecting
    // ^2.0.0 range did NOT win.
    const bEntries = resolved.filter((r) => r.declaration.name === 'B');
    expect(bEntries).toHaveLength(1);
    expect(bEntries[0].version).toBe('1.5.0');
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);

    // The conflict was surfaced via console.warn — the observable shape
    // of the command-level wrapper.
    const diamondWarns = warnSpy.mock.calls.filter((call) =>
      typeof call[0] === 'string'
        ? call[0].includes("Diamond version conflict for module 'B'")
        : false,
    );
    expect(diamondWarns.length).toBeGreaterThanOrEqual(1);
    // Range is semver-normalised by `toVersionRange` before it reaches
    // the conflict event — `^2.0.0` becomes `>=2.0.0 <3.0.0-0`.
    expect(diamondWarns[0][0]).toMatch(/>=2\.0\.0/);
    // Rejecting parent came from the second walk, i.e. C.
    expect(diamondWarns[0][0]).toContain('required by C');
  });
});

// ---------------------------------------------------------------------------
// Staged-fetch reuse: the resolver's ResolvedModule.stagedPath lets the
// installer skip a second source.fetch for every module. Before Phase B
// every import/update paid 2× the network cost because the installer
// re-fetched whatever the resolver had already cloned. These tests pin
// the invariant that fetch is called exactly once per unique module.
// ---------------------------------------------------------------------------
describe('import module — resolver+installer reuse staged fetches', () => {
  const reuseTestDir = join(baseDir, 'tmp-command-import-reuse-tests');

  beforeEach(async () => {
    mkdirSync(reuseTestDir, { recursive: true });
    await copyDir('test/test-data', reuseTestDir);
  });

  afterEach(() => {
    rmSync(reuseTestDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('calls SourceLayer.fetch once per module (3 times for a 3-module tree)', async () => {
    // Build a root + 2 transitives and drive the resolver/installer
    // against an instrumented SourceLayer. Before Phase B this would
    // record 6 calls (resolver fetches each module for config reading,
    // then the installer fetches each module again for the apply
    // phase). After Phase B the resolver's staging path is reused by
    // the installer and the count drops to 3.
    const { createResolver, createInstaller } = await import(
      '../src/modules/index.js'
    );
    const { cleanOrphans } = await import('../src/modules/orphans.js');
    const { toVersionRange } = await import('../src/modules/types.js');
    const { mkdir, writeFile } = await import('node:fs/promises');

    const projectDir = join(reuseTestDir, 'proj-fetch-reuse');
    const commandHandler = new Commands();
    const create = await commandHandler.command(
      Cmd.create,
      ['project', 'fetch-reuse-proj', 'reu'],
      { projectPath: projectDir },
    );
    expect(create.statusCode).toBe(200);

    const commands = new CommandManager(projectDir, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();

    const locations = {
      A: 'https://example.test/A.git',
      B: 'https://example.test/B.git',
      C: 'https://example.test/C.git',
    } as const;

    // A → B → C, all at ^1.0.0.
    const configs = new Map<
      string,
      {
        cardKeyPrefix: string;
        name: string;
        modules: Array<{ name: string; location: string; version?: string }>;
      }
    >([
      [
        locations.A,
        {
          cardKeyPrefix: 'A',
          name: 'A',
          modules: [{ name: 'B', location: locations.B, version: '^1.0.0' }],
        },
      ],
      [
        locations.B,
        {
          cardKeyPrefix: 'B',
          name: 'B',
          modules: [{ name: 'C', location: locations.C, version: '^1.0.0' }],
        },
      ],
      [locations.C, { cardKeyPrefix: 'C', name: 'C', modules: [] }],
    ]);
    const availableByLocation = new Map<string, string[]>([
      [locations.A, ['1.0.0']],
      [locations.B, ['1.0.0']],
      [locations.C, ['1.0.0']],
    ]);

    // Instrumented SourceLayer: records every fetch call so we can
    // assert the total count.
    const fetchCalls: string[] = [];
    const source: SourceLayer = {
      async fetch(target, destRoot, nameHint) {
        fetchCalls.push(target.location);
        const dir = join(destRoot, nameHint);
        await mkdir(join(dir, '.cards', 'local'), { recursive: true });
        const cfg = configs.get(target.location);
        if (!cfg) throw new Error(`no fake config for ${target.location}`);
        await writeFile(
          join(dir, '.cards', 'local', 'cardsConfig.json'),
          JSON.stringify(cfg),
        );
        return dir;
      },
      async listRemoteVersions(location) {
        return availableByLocation.get(location) ?? [];
      },
      async queryRemote() {
        return { reachable: true };
      },
    };

    const tempDir = join(projectDir, '.temp', 'modules');
    const rootA = {
      project: commands.project.basePath,
      name: 'A',
      source: { location: locations.A, private: false },
      versionRange: toVersionRange('^1.0.0'),
      parent: undefined,
    };

    const resolver = createResolver(source);
    const installer = createInstaller(source);
    const resolved = await resolver.resolve([rootA], { tempDir });
    await installer.install(commands.project, resolved, { tempDir });
    await cleanOrphans(commands.project);

    // Exactly three fetches — one per unique module (A, B, C). Before
    // the refactor this would be six.
    expect(fetchCalls.length).toBe(3);
    expect(fetchCalls.sort()).toEqual(
      [locations.A, locations.B, locations.C].sort(),
    );

    // Sanity: all three modules landed on disk.
    expect(existsSync(join(projectDir, '.cards', 'modules', 'A'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'B'))).toBe(true);
    expect(existsSync(join(projectDir, '.cards', 'modules', 'C'))).toBe(true);
  });
});
