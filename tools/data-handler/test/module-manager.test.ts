// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// node
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { copyDir } from '../src/utils/file-utils.js';
import { fileURLToPath } from 'node:url';
import { CommandManager } from '../src/command-manager.js';

describe('module-manager', () => {
  const baseDir = dirname(fileURLToPath(import.meta.url));
  const testDir = join(baseDir, 'tmp-module-manager-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let commands: CommandManager;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    commands = new CommandManager(decisionRecordsPath);
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
  });
  it('try to import duplicate local modules', async () => {
    const localModule = join(testDir, 'valid/minimal');
    await commands.importCmd.importModule(
      localModule,
      commands.project.basePath,
    );
    await commands.importCmd
      .importModule(localModule, commands.project.basePath)
      .then(() => expect(false).equal(true))
      .catch((error) =>
        expect(error.message).to.equal(
          `Imported project has a prefix 'mini' that is already used in the project. Cannot import from module.`,
        ),
      );
  });
  it('try to import duplicate git modules', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule, commands.project.basePath);

    await commands.importCmd
      .importModule(gitModule, commands.project.basePath)
      .then(() => expect(false).equal(true))
      .catch((error) =>
        expect(error.message).to.equal(
          `Imported project has a prefix 'base' that is already used in the project. Cannot import from module.`,
        ),
      );
  });
  it('try to import from incorrect local path', async () => {
    const localModule = join(testDir, 'valid/i-do-not-exist');
    await commands.importCmd
      .importModule(localModule, commands.project.basePath)
      .then(() => expect(false).to.equal(true))
      .catch((error) =>
        expect(error.message).to.include(
          `Input validation error: cannot find project`,
        ),
      );
  });
  it('try to import from incorrect local path', async () => {
    const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';
    await commands.importCmd
      .importModule(gitModule, commands.project.basePath)
      .then(() => expect(false).to.equal(true))
      .catch((error) => expect(error.message).to.includes('HTTP Error:'));
  });
  it('update all modules', async () => {
    let modules = await commands.showCmd.showModules();
    expect(modules.length).equals(0);
    const localModule = join(testDir, 'valid/minimal');
    await commands.importCmd.importModule(
      localModule,
      commands.project.basePath,
    );

    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await commands.importCmd.importModule(gitModule, commands.project.basePath);

    modules = await commands.showCmd.showModules();
    expect(modules.length).equals(2);

    await commands.importCmd.updateAllModules();
    modules = await commands.showCmd.showModules();
    expect(modules.length).equals(2);
  });
});
