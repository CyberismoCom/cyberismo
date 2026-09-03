import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readdir,
  rm,
  readFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';

import { GitManager } from '../src/utils/git-manager.js';
import { pathExists } from '../src/utils/file-utils.js';
import { RWLock } from '../src/utils/rw-lock.js';
import { Version } from '../src/commands/version.js';
import { ConfigurationLogger } from '../src/utils/configuration-logger.js';
import type { ConfigurationOperation } from '../src/utils/configuration-logger.js';
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
  let hasPendingChangesStub: sinon.SinonStub;

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
    hasPendingChangesStub = sinon
      .stub(ConfigurationLogger, 'hasPendingChanges')
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

  async function sealFiles(): Promise<string[]> {
    try {
      const folder = join(dir, '.cards', 'local', 'migrations');
      return (await readdir(folder)).filter((name) =>
        name.startsWith('migrationLog_'),
      );
    } catch {
      return [];
    }
  }

  // A refused bump must leave nothing behind: no seal, and the version as it
  // was both in memory and on disk.
  async function expectNoPartialState(version: string | undefined) {
    expect(await sealFiles()).toEqual([]);
    expect(configuration.version).toBe(version);
    const onDisk = JSON.parse(await readFile(configPath, 'utf-8'));
    expect(onDisk.version).toBe(version);
  }

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

      hasPendingChangesStub.returns(true);

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        /Cannot publish a patch version/,
      );
      await expectNoPartialState('1.0.0');
    });

    it('should seal the log when minor bump attempted with migratable changes', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      await ConfigurationLogger.log(dir, {
        operation: 'resource_rename',
        target: 'test/workflows/flow',
        parameters: {
          type: 'workflows',
          operation: {
            name: 'change',
            target: 'test/workflows/flow',
            to: 'test/workflows/renamed',
          },
        },
      });
      await git.commit('set version and dirty log');

      const result = await versionCmd.bumpVersion('minor');

      expect(result.newVersion).toBe('1.1.0');
      const migrationsFolder = join(dir, '.cards', 'local', 'migrations');
      expect(
        pathExists(join(migrationsFolder, 'migrationLog_0.0.0_1.1.0.jsonl')),
      ).toBe(true);
      expect(
        pathExists(join(migrationsFolder, 'current', 'migrationLog.jsonl')),
      ).toBe(false);
    });

    it('should allow major bump when breaking changes exist', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');

      hasPendingChangesStub.returns(true);
      sinon.stub(ConfigurationLogger, 'createVersion').resolves('dummy');

      const result = await versionCmd.bumpVersion('major');
      expect(result.newVersion).toBe('2.0.0');
    });

    it('patch refuses when the log has a migratable entry, naming it', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      await ConfigurationLogger.log(dir, {
        operation: 'resource_rename',
        target: 'test/workflows/flow',
        parameters: {
          type: 'workflows',
          operation: {
            name: 'change',
            target: 'test/workflows/flow',
            to: 'test/workflows/renamed',
          },
        },
      });
      await git.commit('set version and dirty log');

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        /Cannot publish a patch version[\s\S]*test\/workflows\/flow \(resource_rename\)[\s\S]*Use a minor version bump\./,
      );
      await expectNoPartialState('1.0.0');
    });

    it('patch refusal points at a major bump when a change is destructive', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      await ConfigurationLogger.log(dir, {
        operation: 'resource_delete',
        target: 'test/workflows/flow',
        parameters: { type: 'workflows' },
      });
      await git.commit('set version and dirty log');

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        /Cannot publish a patch version[\s\S]*Use a major version bump\./,
      );
      await expectNoPartialState('1.0.0');
    });

    it('lists two edits of the same field distinguishably', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      await ConfigurationLogger.log(dir, {
        operation: 'resource_update',
        target: 'test/fieldTypes/priority',
        parameters: {
          key: 'enumValues',
          operation: { name: 'remove', target: { enumValue: 'low' } },
        },
      });
      await ConfigurationLogger.log(dir, {
        operation: 'resource_update',
        target: 'test/fieldTypes/priority',
        parameters: {
          key: 'dataType',
          operation: { name: 'change', target: 'enum', to: 'shortText' },
        },
      });
      await git.commit('set version and dirty log');

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        /test\/fieldTypes\/priority \(resource_update\) enumValues remove[\s\S]*test\/fieldTypes\/priority \(resource_update\) dataType change/,
      );
      await expectNoPartialState('1.0.0');
    });

    it('minor refuses with a destructive entry in the log, error names the entry', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      await ConfigurationLogger.log(dir, {
        operation: 'resource_delete',
        target: 'test/workflows/flow',
        parameters: { type: 'workflows' },
      });
      await git.commit('set version and dirty log');

      await expect(versionCmd.bumpVersion('minor')).rejects.toThrow(
        /Cannot publish a minor version[\s\S]*test\/workflows\/flow \(resource_delete\)/,
      );
      await expectNoPartialState('1.0.0');
    });

    it('minor and patch refuse an entry that cannot be routed', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      // No 'key' parameter: entryToMutationInput cannot convert this.
      await ConfigurationLogger.log(dir, {
        operation: 'resource_update',
        target: 'test/fieldTypes/x',
        parameters: {},
      });
      await git.commit('set version and dirty log');

      await expect(versionCmd.bumpVersion('minor')).rejects.toThrow(
        /Cannot publish a minor version[\s\S]*test\/fieldTypes\/x \(resource_update\) — unrecognised entry, treated as destructive/,
      );
      await expectNoPartialState('1.0.0');

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        /Cannot publish a patch version[\s\S]*test\/fieldTypes\/x \(resource_update\) — unrecognised entry, treated as destructive/,
      );
      await expectNoPartialState('1.0.0');
    });

    it('minor and patch refuse an entry with an unknown operation', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      // An operation this build does not know, e.g. written by a newer version.
      await ConfigurationLogger.log(dir, {
        operation: 'resource_transmute' as ConfigurationOperation,
        target: 'test/fieldTypes/x',
        parameters: { key: 'enumValues' },
      });
      await git.commit('set version and dirty log');

      await expect(versionCmd.bumpVersion('minor')).rejects.toThrow(
        /Cannot publish a minor version[\s\S]*test\/fieldTypes\/x \(resource_transmute\) enumValues — unrecognised entry, treated as destructive/,
      );
      await expectNoPartialState('1.0.0');

      await expect(versionCmd.bumpVersion('patch')).rejects.toThrow(
        /Cannot publish a patch version[\s\S]*test\/fieldTypes\/x \(resource_transmute\) enumValues — unrecognised entry, treated as destructive/,
      );
      await expectNoPartialState('1.0.0');
    });

    it('major seals with destructive entries in the log', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      hasPendingChangesStub.restore();
      await ConfigurationLogger.log(dir, {
        operation: 'resource_delete',
        target: 'test/workflows/flow',
        parameters: { type: 'workflows' },
      });
      await git.commit('set version and dirty log');

      const result = await versionCmd.bumpVersion('major');

      expect(result.newVersion).toBe('2.0.0');
      const migrationsFolder = join(dir, '.cards', 'local', 'migrations');
      expect(
        pathExists(join(migrationsFolder, 'migrationLog_0.0.0_2.0.0.jsonl')),
      ).toBe(true);
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
      await expectNoPartialState(undefined);
    });
  });

  describe('migration log snapshotting', () => {
    it('should snapshot migration log when log exists', async () => {
      hasPendingChangesStub.returns(true);
      const createVersionStub = sinon
        .stub(ConfigurationLogger, 'createVersion')
        .resolves();

      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      await versionCmd.bumpVersion('patch');

      expect(createVersionStub.calledOnce).toBe(true);
      expect(createVersionStub.calledWith(dir, '1.0.0')).toBe(true);
    });

    it('seals an empty log on a clean minor bump (no breaking changes)', async () => {
      configuration.version = '1.0.0';
      await configuration.setVersion('1.0.0');
      await git.commit('set version');
      // hasPendingChangesStub returns false (set in beforeEach)

      const result = await versionCmd.bumpVersion('minor');

      expect(result.newVersion).toBe('1.1.0');
      const migrationsFolder = join(dir, '.cards', 'local', 'migrations');
      expect(
        pathExists(join(migrationsFolder, 'migrationLog_0.0.0_1.1.0.jsonl')),
      ).toBe(true);
    });
  });
});
