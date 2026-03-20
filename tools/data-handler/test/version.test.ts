/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
use(chaiAsPromised);
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';

import { GitManager } from '../src/utils/git-manager.js';
import { RWLock } from '../src/utils/rw-lock.js';
import { Version } from '../src/commands/version.js';
import {
  ConfigurationLogger,
  ConfigurationOperation,
} from '../src/utils/configuration-logger.js';
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
    sinon.stub(ConfigurationLogger, 'hasLog').returns(false);

    configuration = makeConfiguration(configPath);

    const project = {
      basePath: dir,
      git,
      lock: new RWLock(),
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

      expect(result.previousVersion).to.be.undefined;
      expect(result.newVersion).to.equal('1.0.0');
    });

    it('should produce 1.0.0 for first major bump too', async () => {
      await writeFile(join(dir, 'cardRoot', 'card.json'), '{}');
      await git.commit('Add card');

      const result = await versionCmd.bumpVersion('major');

      expect(result.previousVersion).to.be.undefined;
      expect(result.newVersion).to.equal('1.0.0');
    });

    it('should bump patch version', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      const result = await versionCmd.bumpVersion('patch');

      expect(result.previousVersion).to.equal('1.0.0');
      expect(result.newVersion).to.equal('1.0.1');
    });

    it('should bump minor version', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      const result = await versionCmd.bumpVersion('minor');

      expect(result.previousVersion).to.equal('1.0.0');
      expect(result.newVersion).to.equal('1.1.0');
    });

    it('should bump major version', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      const result = await versionCmd.bumpVersion('major');

      expect(result.previousVersion).to.equal('1.0.0');
      expect(result.newVersion).to.equal('2.0.0');
    });

    it('should handle sequential bumps', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('first change');

      const first = await versionCmd.bumpVersion('patch');
      expect(first.previousVersion).to.be.undefined;
      expect(first.newVersion).to.equal('1.0.0');

      const second = await versionCmd.bumpVersion('patch');
      expect(second.previousVersion).to.equal('1.0.0');
      expect(second.newVersion).to.equal('1.0.1');
    });
  });

  describe('version written to cardsConfig', () => {
    it('should write new version to cardsConfig.json', async () => {
      await writeFile(join(dir, 'cardRoot', 'card.json'), '{}');
      await git.commit('Add card');

      await versionCmd.bumpVersion('patch');

      const configContent = JSON.parse(await readFile(configPath, 'utf-8'));
      expect(configContent.version).to.equal('1.0.0');
    });
  });

  describe('breaking change gate', () => {
    it('should throw when patch bump attempted with breaking changes', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      sinon.stub(ConfigurationLogger, 'entries').resolves([
        {
          timestamp: new Date().toISOString(),
          operation: ConfigurationOperation.RESOURCE_DELETE,
          target: 'some-resource',
        },
      ]);

      await expect(versionCmd.bumpVersion('patch')).to.be.rejectedWith(
        'breaking configuration changes',
      );
    });

    it('should throw when minor bump attempted with breaking changes', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      sinon.stub(ConfigurationLogger, 'entries').resolves([
        {
          timestamp: new Date().toISOString(),
          operation: ConfigurationOperation.MODULE_REMOVE,
          target: 'some-module',
        },
      ]);

      await expect(versionCmd.bumpVersion('minor')).to.be.rejectedWith(
        'breaking configuration changes',
      );
    });

    it('should allow major bump when breaking changes exist', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      sinon.stub(ConfigurationLogger, 'entries').resolves([
        {
          timestamp: new Date().toISOString(),
          operation: ConfigurationOperation.RESOURCE_DELETE,
          target: 'some-resource',
        },
      ]);

      const result = await versionCmd.bumpVersion('major');
      expect(result.newVersion).to.equal('2.0.0');
    });

    it('should not apply breaking change gate for first version', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('first change');

      sinon.stub(ConfigurationLogger, 'entries').resolves([
        {
          timestamp: new Date().toISOString(),
          operation: ConfigurationOperation.RESOURCE_DELETE,
          target: 'some-resource',
        },
      ]);

      const result = await versionCmd.bumpVersion('patch');
      expect(result.previousVersion).to.be.undefined;
      expect(result.newVersion).to.equal('1.0.0');
    });
  });

  describe('error conditions', () => {
    it('should throw on uncommitted changes', async () => {
      await writeFile(join(dir, 'cardRoot', 'dirty.txt'), 'uncommitted');

      await expect(versionCmd.bumpVersion('patch')).to.be.rejectedWith(
        'uncommitted changes',
      );
    });
  });

  describe('migration log snapshotting', () => {
    it('should snapshot migration log when log exists', async () => {
      sinon.restore(); // Remove the hasLog stub from beforeEach
      sinon.stub(ConfigurationLogger, 'hasLog').returns(true);
      const createVersionStub = sinon
        .stub(ConfigurationLogger, 'createVersion')
        .resolves();

      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      await versionCmd.bumpVersion('patch');

      expect(createVersionStub.calledOnce).to.be.true;
      expect(createVersionStub.calledWith(dir, '1.0.0')).to.be.true;
    });
  });
});
