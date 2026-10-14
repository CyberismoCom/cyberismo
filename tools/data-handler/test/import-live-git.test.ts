import { expect, describe, it, beforeEach, afterEach } from 'vitest';

import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';

import semver from 'semver';

import { copyDir } from '../src/utils/file-utils.js';
import { type Workspace } from '../src/workspace/workspace.js';
import { openTestWorkspace } from './helpers/open-test-workspace.js';

const { satisfies } = semver;

describe('import command — live git', () => {
  const skipTest = process.env.CI && platform() === 'win32';
  const baseDir = import.meta.dirname;
  const testDir = join(baseDir, 'tmp-import-live-git-tests');
  const decisionRecordsPath = join(testDir, 'valid/decision-records');
  let ws: Workspace;

  beforeEach(async () => {
    mkdirSync(testDir, { recursive: true });
    await copyDir('test/test-data/', testDir);
    ws = await openTestWorkspace(decisionRecordsPath, {});
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('import git module', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await ws.modules.install(gitModule);
    const modules = await ws.modules.list();
    expect(modules.length).toBe(1);
    expect(modules[0].name).toBe('base');
  }, 120000);
  it('import git module with no version pins ^<latest tagged version>', async () => {
    // npm-install-style default: no caller range means pin to the highest
    // remote tag with a caret. The persisted range must be a valid caret
    // expansion covering the installed version.
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await ws.modules.install(gitModule);
    const persisted = ws.checkout.configuration.modules.find(
      (m) => m.name === 'base',
    );
    expect(persisted).toBeDefined();
    expect(persisted!.version).toMatch(/^\^\d+\.\d+\.\d+$/);
    const modules = await ws.modules.list();
    expect(modules[0].version).toBeDefined();
    expect(
      satisfies(modules[0].version as string, persisted!.version as string),
    ).toBe(true);
  }, 120000);
  it('import git module at a pinned version installs that version', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await ws.modules.install(gitModule, { version: '1.0.0' });
    const modules = await ws.modules.list();
    expect(modules.length).toBe(1);
    expect(modules[0].name).toBe('base');
    expect(modules[0].version).toBe('1.0.0');
    const installedConfig = JSON.parse(
      readFileSync(
        join(
          decisionRecordsPath,
          '.cards',
          'modules',
          'base',
          'cardsConfig.json',
        ),
        'utf-8',
      ),
    );
    expect(installedConfig.version).toBe('1.0.0');
  }, 120000);
  it.skipIf(skipTest)(
    'import git module using credentials',
    async () => {
      const gitModule = 'https://github.com/CyberismoCom/module-base.git';
      await ws.modules.install(gitModule, {
        private: true,
        credentials: {
          username: process.env.CYBERISMO_GIT_USER,
          token: process.env.CYBERISMO_GIT_TOKEN,
        },
      });
      const modules = await ws.modules.list();
      expect(modules.length).toBe(1);
    },
    120000,
  );
  it('re-importing a git module is upsert', async () => {
    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await ws.modules.install(gitModule);
    await ws.modules.install(gitModule);
    const modules = await ws.modules.list();
    expect(modules.length).toBe(1);
  }, 120000);
  it.skipIf(skipTest)(
    'try to import from incorrect git path',
    async () => {
      const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';

      await expect(ws.modules.install(gitModule)).rejects.toThrow(
        "Couldn't fetch module: 'https://github.com/CyberismoCom/i-do-not-exist.git' is unreachable",
      );
    },
    120000,
  );
  it('try to import from incorrect private git path', async () => {
    const gitModule = 'https://github.com/CyberismoCom/i-do-not-exist.git';
    const options = {
      private: true,
      credentials: {
        username: process.env.CYBERISMO_GIT_USER,
        token: process.env.CYBERISMO_GIT_TOKEN,
      },
    };
    await expect(ws.modules.install(gitModule, options)).rejects.toThrow(
      "Couldn't fetch module: 'https://github.com/CyberismoCom/i-do-not-exist.git' is unreachable",
    );
  }, 120000);
  it('update all modules', async () => {
    let modules = await ws.modules.list();
    expect(modules.length).toBe(0);
    const localModule = join(testDir, 'valid/minimal');
    await ws.modules.install(localModule);

    const gitModule = 'https://github.com/CyberismoCom/module-base.git';
    await ws.modules.install(gitModule, {
      credentials: {
        username: process.env.CYBERISMO_GIT_USER,
        token: process.env.CYBERISMO_GIT_TOKEN,
      },
    });

    modules = await ws.modules.list();
    expect(modules.length).toBe(2);

    await ws.modules.update({});
    modules = await ws.modules.list();
    expect(modules.length).toBe(2);
  }, 120000);
});
