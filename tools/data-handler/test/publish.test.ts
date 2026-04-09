import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';
import { simpleGit } from 'simple-git';

import { GitManager } from '../src/utils/git-manager.js';
import { RWLock } from '../src/utils/rw-lock.js';
import { Publish } from '../src/commands/publish.js';
import type { Project } from '../src/containers/project.js';

/** Create a simpleGit instance with a test identity so tests work without global git config. */
function testGit(dir: string) {
  return simpleGit(dir, {
    config: ['user.name=Test', 'user.email=test@test.com'],
  });
}

describe('Publish', () => {
  let dir: string;
  let git: GitManager;
  let publish: Publish;
  let configuration: { version?: string };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'publish-test-'));
    await mkdir(join(dir, 'cardRoot'), { recursive: true });
    await mkdir(join(dir, '.cards', 'local'), { recursive: true });
    await writeFile(
      join(dir, '.cards', 'local', 'cardsConfig.json'),
      '{"name": "test"}',
    );

    git = new GitManager(dir);
    await git.initialize();

    configuration = {};

    const project = {
      basePath: dir,
      git,
      lock: new RWLock(),
      configuration,
    } as unknown as Project;

    publish = new Publish(project);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    sinon.restore();
  });

  describe('publishing', () => {
    it('should create tag for version in cardsConfig', async () => {
      configuration.version = '1.0.0';
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      const pushStub = sinon.stub(git, 'push').resolves();

      const result = await publish.publishVersion(false);

      expect(result.version).toBe('1.0.0');
      expect(result.remote).toBe('origin');
      expect(result.dryRun).toBe(false);

      const tags = await testGit(dir).tags();
      expect(tags.all).toContain('v1.0.0');

      expect(pushStub.calledOnce).toBe(true);
      expect(pushStub.calledWith({ tags: true, remote: 'origin' })).toBe(true);
    });

    it('should create tag with correct annotation message', async () => {
      configuration.version = '2.1.0';
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      sinon.stub(git, 'push').resolves();

      await publish.publishVersion(false);

      const tagInfo = await testGit(dir).raw([
        'tag',
        '-l',
        '--format=%(contents:subject)',
        'v2.1.0',
      ]);
      expect(tagInfo.trim()).toBe('Release v2.1.0');
    });
  });

  describe('error conditions', () => {
    it('should throw if no version set', async () => {
      await expect(publish.publishVersion(false)).rejects.toThrow(
        'No version set',
      );
    });

    it('should throw if version already tagged', async () => {
      configuration.version = '1.0.0';
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');
      await git.tagVersion('1.0.0', 'Release v1.0.0');

      await expect(publish.publishVersion(false)).rejects.toThrow(
        'already published',
      );
    });

    it('should not save the tag when push fails', async () => {
      configuration.version = '1.0.0';
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      sinon.stub(git, 'push').rejects(new Error('network error'));

      await expect(publish.publishVersion(false)).rejects.toThrow(
        'network error',
      );

      // Tag should have been cleaned up so retry works
      const tags = await testGit(dir).tags();
      expect(tags.all).not.toContain('v1.0.0');
    });
  });

  describe('dry run', () => {
    it('should return info without creating tag', async () => {
      configuration.version = '1.0.0';
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      const pushSpy = sinon.spy(git, 'push');

      const result = await publish.publishVersion(true);

      expect(result.version).toBe('1.0.0');
      expect(result.dryRun).toBe(true);

      const tags = await testGit(dir).tags();
      expect(tags.all).not.toContain('v1.0.0');

      expect(pushSpy.called).toBe(false);
    });
  });
});
