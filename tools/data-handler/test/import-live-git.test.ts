// testing
import { expect, describe, it, beforeEach, afterEach } from 'vitest';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';

import { copyDir } from '../src/utils/file-utils.js';
import { CommandManager } from '../src/command-manager.js';

describe('import command — live git', () => {
  const skipTest = process.env.CI && os.platform() === 'win32';
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-import-live-git-tests');
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

  it('import git module', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule);
    const modules = await commands.showCmd.showModules();
    expect(modules.length).equals(1);
  }, 60000);
  it('import git module using credentials', async function (context) {
    if (skipTest) {
      context.skip();
    } else {
      const gitModule = 'https://github.com/CyberismoCom/module-base.git';
      await commands.importCmd.importModule(gitModule, {
        private: true,
        credentials: {
          username: process.env.CYBERISMO_GIT_USER,
          token: process.env.CYBERISMO_GIT_TOKEN,
        },
      });
      const modules = await commands.showCmd.showModules();
      expect(modules.length).equals(1);
    }
  }, 60000);
  it('re-importing a git module is upsert (spec ImportModule)', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule);

    await expect(
      commands.importCmd.importModule(gitModule),
    ).resolves.not.toThrow();
    const modules = await commands.showCmd.showModules();
    expect(modules.length).equals(1);
  }, 60000);
  it('try to import from incorrect git path', async function (context) {
    if (skipTest) {
      context.skip();
    } else {
      const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';

      await expect(commands.importCmd.importModule(gitModule)).rejects.toThrow(
        'Failed to clone module',
      );
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
      commands.importCmd.importModule(gitModule, options),
    ).rejects.toThrow('Failed to clone module');
  }, 60000);
  it('update all modules', async () => {
    let modules = await commands.showCmd.showModules();
    expect(modules.length).equals(0);
    const localModule = join(testDir, 'valid/minimal');
    await commands.importCmd.importModule(localModule);

    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule, {
      credentials: {
        username: process.env.CYBERISMO_GIT_USER,
        token: process.env.CYBERISMO_GIT_TOKEN,
      },
    });

    modules = await commands.showCmd.showModules();
    expect(modules.length).equals(2);

    await commands.importCmd.updateAllModules();
    modules = await commands.showCmd.showModules();
    expect(modules.length).equals(2);
  }, 60000);
});
