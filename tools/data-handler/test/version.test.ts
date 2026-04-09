import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';

import { GitManager } from '../src/utils/git-manager.js';
import { RWLock } from '../src/utils/rw-lock.js';
import { Version } from '../src/commands/version.js';
import { ConfigurationLogger } from '../src/utils/configuration-logger.js';
import { getCommitContext } from '../src/utils/commit-context.js';
import type { Project } from '../src/containers/project.js';

function makeConfiguration(configPath: string, initialVersion?: string) {
  return {
    version: initialVersion,
    async setVersion(v: string) {
      this.version = v;
      const { writeFile: wf } = await import('node:fs/promises');
      const content = JSON.parse(await readFile(configPath, 'utf-8'));
      content.version = v;
      await wf(configPath, JSON.stringify(content, null, 4), 'utf-8');
    },
  };
}

describe('Version', () => {
  let dir: string;
  let git: GitManager;
  let versionCmd: Version;
  let configPath: string;
  let configuration: ReturnType<typeof makeConfiguration>;
  let hasBreakingChangesStub: sinon.SinonStub;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'version-test-'));
    await mkdir(join(dir, 'cardRoot'), { recursive: true });
    await mkdir(join(dir, '.cards', 'local'), { recursive: true });
    configPath = join(dir, '.cards', 'local', 'cardsConfig.json');
    await writeFile(
      configPath,
      JSON.stringify({
        cardKeyPrefix: 'test',
        name: 'test',
        description: 'test project',
      }),
    );

    git = new GitManager(dir);
    await git.initialize();

    // Bypass migration log snapshot handling — these tests focus on version bumping
    hasBreakingChangesStub = sinon
      .stub(ConfigurationLogger, 'hasBreakingChanges')
      .returns(false);

    configuration = makeConfiguration(configPath);

    const lock = new RWLock();
    lock.onAfterWrite(async () => {
      const context = getCommitContext();
      await git.commit(context.message ?? 'Autocommit');
    });

    const project = {
      basePath: dir,
      git,
      lock,
      configuration,
    } as unknown as Project;

    versionCmd = new Version(project);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    sinon.restore();
  });

  describe('version bumping', () => {
    it('should produce 1.0.0 for first version regardless of bump type', async () => {
      await writeFile(join(dir, 'cardRoot', 'card.json'), '{}');
      await git.commit('Add card');

      const result = await versionCmd.bumpVersion('patch');

      expect(result.previousVersion).toBeUndefined();
      expect(result.newVersion).toBe('1.0.0');
    });

    it('should produce 1.0.0 for first major bump', async () => {
      await writeFile(join(dir, 'cardRoot', 'card.json'), '{}');
      await git.commit('Add card');

      const result = await versionCmd.bumpVersion('major');

      expect(result.previousVersion).toBeUndefined();
      expect(result.newVersion).toBe('1.0.0');
    });

    it('should bump patch version', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      const result = await versionCmd.bumpVersion('patch');

      expect(result.previousVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('1.0.1');
    });

    it('should bump minor version', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      const result = await versionCmd.bumpVersion('minor');

      expect(result.previousVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('1.1.0');
    });

    it('should bump major version', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      const result = await versionCmd.bumpVersion('major');

      expect(result.previousVersion).toBe('1.0.0');
      expect(result.newVersion).toBe('2.0.0');
    });

    it('should handle sequential bumps', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('first change');

      const first = await versionCmd.bumpVersion('patch');
      expect(first.previousVersion).toBeUndefined();
      expect(first.newVersion).toBe('1.0.0');

      const second = await versionCmd.bumpVersion('patch');
      expect(second.previousVersion).toBe('1.0.0');
      expect(second.newVersion).toBe('1.0.1');
    });
  });

  describe('version written to cardsConfig', () => {
    it('should write new version to cardsConfig.json', async () => {
      await writeFile(join(dir, 'cardRoot', 'card.json'), '{}');
      await git.commit('Add card');

      await versionCmd.bumpVersion('patch');

      const configContent = JSON.parse(await readFile(configPath, 'utf-8'));
      expect(configContent.version).toBe('1.0.0');
    });
  });

  describe('breaking change gate', () => {
    it('should throw when patch bump attempted with breaking changes', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      hasBreakingChangesStub.returns(true);

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        'breaking configuration changes',
      );
    });

    it('should throw when minor bump attempted with breaking changes', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      hasBreakingChangesStub.returns(true);

      await expect(versionCmd.bumpVersion('minor')).rejects.toThrow(
        'breaking configuration changes',
      );
    });

    it('should allow major bump when breaking changes exist', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      hasBreakingChangesStub.returns(true);
      sinon.stub(ConfigurationLogger, 'createVersion').resolves('dummy');

      const result = await versionCmd.bumpVersion('major');
      expect(result.newVersion).toBe('2.0.0');
    });

    it('should not apply breaking change gate for first version', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('first change');

      const result = await versionCmd.bumpVersion('patch');
      expect(result.previousVersion).toBeUndefined();
      expect(result.newVersion).toBe('1.0.0');
    });
  });

  describe('error conditions', () => {
    it('should throw on uncommitted changes', async () => {
      await writeFile(join(dir, 'cardRoot', 'dirty.txt'), 'uncommitted');

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        'uncommitted changes',
      );
    });
  });

  describe('migration log snapshotting', () => {
    it('should snapshot migration log when log exists', async () => {
      hasBreakingChangesStub.returns(true);
      const createVersionStub = sinon
        .stub(ConfigurationLogger, 'createVersion')
        .resolves();

      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      await versionCmd.bumpVersion('patch');

      expect(createVersionStub.calledOnce).toBe(true);
      expect(createVersionStub.calledWith(dir, '1.0.0')).toBe(true);
    });
  });
});
