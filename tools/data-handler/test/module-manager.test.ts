// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';
import type * as sinon from 'sinon';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';
import { mockEnsureModuleListUpToDate } from './helpers/test-utils.js';

describe('module-manager', () => {
  const skipTest = process.env.CI && os.platform() === 'win32';
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-module-manager-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;
  let ensureModuleListStub: sinon.SinonStub;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ensureModuleListStub = mockEnsureModuleListUpToDate();
    commands = new CommandManager(decisionRecordsPath, {
      autoSaveConfiguration: false,
    });
    await commands.initialize();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    rmSync(join(testDir, '.temp'), { recursive: true, force: true });
    ensureModuleListStub.restore();
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
  }).timeout(60000);
  it('import git module using credentials', async function () {
    if (skipTest) {
      this.skip();
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
  }).timeout(60000);
  it('try to import duplicate local modules', async () => {
    const localModule = join(testDir, 'valid/minimal');
    await commands.importCmd.importModule(
      localModule,
      commands.project.basePath,
    );
    await expect(
      commands.importCmd.importModule(localModule, commands.project.basePath),
    ).to.be.rejectedWith(
      `Imported project has a prefix 'mini' that is already used in the project. Cannot import from module.`,
    );
  });
  it('try to import duplicate git modules', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule, commands.project.basePath);

    await expect(
      commands.importCmd.importModule(gitModule, commands.project.basePath),
    ).to.be.rejectedWith(
      `Imported project has a prefix 'base' that is already used in the project. Cannot import from module.`,
    );
  }).timeout(60000);
  it('try to import from incorrect local path', async () => {
    const localModule = join(testDir, 'valid/i-do-not-exist');
    await expect(
      commands.importCmd.importModule(localModule, commands.project.basePath),
    ).to.be.rejectedWith(`Input validation error: cannot find project`);
  });
  it('try to import from incorrect git path', async function () {
    if (skipTest) {
      this.skip();
    } else {
      const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';
      const result = await expect(
        commands.importCmd.importModule(gitModule, commands.project.basePath),
      ).to.be.rejected;
      expect(result.message).to.include('Failed to clone module');
    }
  }).timeout(60000);
  it('try to import from incorrect private git path', async () => {
    const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';
    const options = {
      private: true,
      credentials: {
        username: process.env.CYBERISMO_GIT_USER,
        token: process.env.CYBERISMO_GIT_TOKEN,
      },
    };
    const result = await expect(
      commands.importCmd.importModule(
        gitModule,
        commands.project.basePath,
        options,
      ),
    ).to.be.rejected;
    expect(result.message).to.include('Failed to clone module');
  }).timeout(60000);
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
  }).timeout(60000);
});
