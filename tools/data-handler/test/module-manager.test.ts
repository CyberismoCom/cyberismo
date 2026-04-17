// testing
import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';

// node
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

import { simpleGit } from 'simple-git';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import { ModuleManager } from '../src/module-manager.js';
import { GitManager } from '../src/utils/git-manager.js';
import type { ModuleSetting } from '../src/interfaces/project-interfaces.js';

describe('module-manager', () => {
  const skipTest = process.env.CI && os.platform() === 'win32';
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-module-manager-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(join(testDir, '.temp'), { recursive: true, force: true });
  });

  it('import local module', async () => {
    const localModule = join(testDir, 'valid/minimal');
    await commands.importCmd.importModule(
      localModule,
      commands.project.basePath,
    );
    const modules = await commands.showCmd.showModules();
    expect(modules.length).equals(1);
  });
  it('import git module', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule, commands.project.basePath);
    const modules = await commands.showCmd.showModules();
    expect(modules.length).equals(1);
  }, 60000);
  it('import git module using credentials', async function (context) {
    if (skipTest) {
      context.skip();
    } else {
      const gitModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(
        gitModule,
        commands.project.basePath,
        {
          private: true,
          credentials: {
            username: process.env.CYBERISMO_GIT_USER,
            token: process.env.CYBERISMO_GIT_TOKEN,
          },
        },
      );
      const modules = await commands.showCmd.showModules();
      expect(modules.length).equals(1);
    }
  }, 60000);
  it('try to import duplicate local modules', async () => {
    const localModule = join(testDir, 'valid/minimal');
    await commands.importCmd.importModule(
      localModule,
      commands.project.basePath,
    );
    await expect(
      commands.importCmd.importModule(localModule, commands.project.basePath),
    ).rejects.toThrow(
      `Imported project has a prefix 'mini' that is already used in the project. Cannot import from module.`,
    );
  });
  it('try to import duplicate git modules', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule, commands.project.basePath);

    await expect(
      commands.importCmd.importModule(gitModule, commands.project.basePath),
    ).rejects.toThrow(
      `Imported project has a prefix 'base' that is already used in the project. Cannot import from module.`,
    );
  }, 60000);
  it('try to import from incorrect local path', async () => {
    const localModule = join(testDir, 'valid/i-do-not-exist');
    await expect(
      commands.importCmd.importModule(localModule, commands.project.basePath),
    ).rejects.toThrow(`Input validation error: cannot find project`);
  });
  it('try to import from incorrect git path', async function (context) {
    if (skipTest) {
      context.skip();
    } else {
      const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';

      await expect(
        commands.importCmd.importModule(gitModule, commands.project.basePath),
      ).rejects.toThrow('Failed to clone module');
    }
  }, 60000);
  it('try to import from incorrect private git path', async () => {
    const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';
    const options = {
      private: true,
      credentials: {
        username: process.env.CYBERISMO_GIT_USER,
        token: process.env.CYBERISMO_GIT_TOKEN,
      },
    };
    await expect(
      commands.importCmd.importModule(
        gitModule,
        commands.project.basePath,
        options,
      ),
    ).rejects.toThrow('Failed to clone module');
  }, 60000);
  it('update all modules', async () => {
    let modules = await commands.showCmd.showModules();
    expect(modules.length).equals(0);
    const localModule = join(testDir, 'valid/minimal');
    await commands.importCmd.importModule(
      localModule,
      commands.project.basePath,
    );

    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(
      gitModule,
      commands.project.basePath,
      {
        credentials: {
          username: process.env.CYBERISMO_GIT_USER,
          token: process.env.CYBERISMO_GIT_TOKEN,
        },
      },
    );

    modules = await commands.showCmd.showModules();
    expect(modules.length).equals(2);

    await commands.importCmd.updateAllModules();
    modules = await commands.showCmd.showModules();
    expect(modules.length).equals(2);
  }, 60000);
});

describe('ModuleManager.listAvailableVersions', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-module-manager-versions-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns empty array for a local (non-git) module', async () => {
    const manager = new ModuleManager(commands.project);
    const localModule: ModuleSetting = {
      name: 'local-mod',
      location: '/some/local/path',
    };
    const versions = await manager.listAvailableVersions(localModule);
    expect(versions).toEqual([]);
  });

  it('embeds credentials in the remote URL for a private git module', async () => {
    const manager = new ModuleManager(commands.project);
    const privateModule: ModuleSetting = {
      name: 'private-mod',
      location: 'https://github.com/example/module.git',
      private: true,
    };
    const credentials = { username: 'alice', token: 'secret-token' };
    let capturedUrl = '';
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockImplementation(
      async (url) => {
        capturedUrl = url;
        return [];
      },
    );
    await manager.listAvailableVersions(privateModule, credentials);
    expect(capturedUrl).toContain('alice:secret-token@github.com');
  });

  it('does not embed credentials for a public git module', async () => {
    const manager = new ModuleManager(commands.project);
    const publicModule: ModuleSetting = {
      name: 'public-mod',
      location: 'https://github.com/example/module.git',
    };
    const credentials = { username: 'alice', token: 'secret-token' };
    let capturedUrl = '';
    vi.spyOn(GitManager, 'listRemoteVersionTags').mockImplementation(
      async (url) => {
        capturedUrl = url;
        return [];
      },
    );
    await manager.listAvailableVersions(publicModule, credentials);
    expect(capturedUrl).toBe('https://github.com/example/module.git');
    expect(capturedUrl).not.toContain('alice');
  });
});

describe('ModuleManager git-based updates', () => {
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-module-manager-git-update-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  const fakeRemotePath = join(testDir, 'fake-remote');
  let commands: CommandManager;

  async function setupFakeRemote() {
    mkdirSync(fakeRemotePath, { recursive: true });
    await copyDir('test/test-data/valid/minimal', fakeRemotePath);

    const git = simpleGit(fakeRemotePath, {
      config: ['user.name=Test', 'user.email=test@test.com'],
    });
    await git.init();

    // v1.0.0: just the base minimal structure with a version field
    const configPath = join(
      fakeRemotePath,
      '.cards',
      'local',
      'cardsConfig.json',
    );
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    config.version = '1.0.0';
    writeFileSync(configPath, JSON.stringify(config, null, 2));

    await git.add('.');
    await git.commit('Initial commit');
    await git.addAnnotatedTag('v1.0.0', 'Version 1.0.0');

    // v2.0.0: bump version and add a new card type
    config.version = '2.0.0';
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    writeFileSync(
      join(fakeRemotePath, '.cards', 'local', 'cardTypes', 'newCardtype.json'),
      JSON.stringify(
        {
          name: 'mini/cardTypes/newCardtype',
          displayName: 'New Card Type',
          workflow: 'mini/workflows/minimal',
        },
        null,
        2,
      ),
    );

    await git.add('.');
    await git.commit('Bump to v2.0.0');
    await git.addAnnotatedTag('v2.0.0', 'Version 2.0.0');
  }

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    await setupFakeRemote();
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
    // Import the minimal module so the project has an initial 'mini' state to update from
    await commands.importCmd.importModule(
      join(testDir, 'valid/minimal'),
      commands.project.basePath,
    );
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('updates module files to HEAD', async () => {
    const manager = new ModuleManager(commands.project);
    vi.spyOn(
      manager as unknown as { isGitModule: (m: ModuleSetting) => boolean },
      'isGitModule',
    ).mockReturnValue(true);

    await manager.updateModule({ name: 'mini', location: fakeRemotePath });

    const installedConfig = JSON.parse(
      readFileSync(
        join(commands.project.paths.modulesFolder, 'mini', 'cardsConfig.json'),
        'utf-8',
      ),
    );
    expect(installedConfig.version).toBe('2.0.0');
    expect(
      existsSync(
        join(
          commands.project.paths.modulesFolder,
          'mini',
          'cardTypes',
          'newCardtype.json',
        ),
      ),
    ).toBe(true);
  });

  it('updates module files to a specific tagged version', async () => {
    const manager = new ModuleManager(commands.project);
    vi.spyOn(
      manager as unknown as { isGitModule: (m: ModuleSetting) => boolean },
      'isGitModule',
    ).mockReturnValue(true);

    await manager.updateModule(
      {
        name: 'mini',
        location: fakeRemotePath,
      },
      undefined,
      undefined,
      new Map([['mini', 'v1.0.0']]),
    );

    const installedConfig = JSON.parse(
      readFileSync(
        join(commands.project.paths.modulesFolder, 'mini', 'cardsConfig.json'),
        'utf-8',
      ),
    );
    expect(installedConfig.version).toBe('1.0.0');
    expect(
      existsSync(
        join(
          commands.project.paths.modulesFolder,
          'mini',
          'cardTypes',
          'newCardtype.json',
        ),
      ),
    ).toBe(false);
  });
});
