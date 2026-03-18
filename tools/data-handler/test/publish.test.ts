/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect } from 'chai';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sinon from 'sinon';
import { simpleGit } from 'simple-git';

import { GitManager } from '../src/utils/git-manager.js';
import { RWLock } from '../src/utils/rw-lock.js';
import { Publish } from '../src/commands/publish.js';
import { ConfigurationLogger } from '../src/utils/configuration-logger.js';
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

    // Bypass migration log handling — these tests focus on version bumping
    sinon.stub(ConfigurationLogger, 'hasLog').returns(false);

    const project = {
      basePath: dir,
      git,
      lock: new RWLock(),
    } as unknown as Project;

    publish = new Publish(project);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    sinon.restore();
  });

  describe('version bumping', () => {
    it('should publish first version as 1.0.0', async () => {
      // Add a change so there's something to publish
      await writeFile(join(dir, 'cardRoot', 'card.json'), '{}');
      await git.commit('Add card');

      const result = await publish.publishVersion('patch');

      expect(result.previousVersion).to.be.null;
      expect(result.newVersion).to.equal('1.0.0');

      const tags = await testGit(dir).tags();
      expect(tags.all).to.include('v1.0.0');
    });

    it('should always produce 1.0.0 for first publish regardless of bump type', async () => {
      await writeFile(join(dir, 'cardRoot', 'card.json'), '{}');
      await git.commit('Add card');

      const result = await publish.publishVersion('major');

      expect(result.previousVersion).to.be.null;
      expect(result.newVersion).to.equal('1.0.0');
    });

    it('should bump patch version', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');
      await git.tagVersion('1.0.0', 'Release v1.0.0');

      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await git.commit('another change');

      const result = await publish.publishVersion('patch');

      expect(result.previousVersion).to.equal('1.0.0');
      expect(result.newVersion).to.equal('1.0.1');
    });

    it('should bump minor version', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');
      await git.tagVersion('1.0.0', 'Release v1.0.0');

      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await git.commit('another change');

      const result = await publish.publishVersion('minor');

      expect(result.previousVersion).to.equal('1.0.0');
      expect(result.newVersion).to.equal('1.1.0');
    });

    it('should bump major version', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');
      await git.tagVersion('1.0.0', 'Release v1.0.0');

      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await git.commit('another change');

      const result = await publish.publishVersion('major');

      expect(result.previousVersion).to.equal('1.0.0');
      expect(result.newVersion).to.equal('2.0.0');
    });

    it('should handle sequential publishes', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('first change');

      const first = await publish.publishVersion('patch');
      expect(first.previousVersion).to.be.null;
      expect(first.newVersion).to.equal('1.0.0');

      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await git.commit('second change');

      const second = await publish.publishVersion('patch');
      expect(second.previousVersion).to.equal('1.0.0');
      expect(second.newVersion).to.equal('1.0.1');
    });
  });

  describe('error conditions', () => {
    it('should throw on uncommitted changes', async () => {
      await writeFile(join(dir, 'cardRoot', 'dirty.txt'), 'uncommitted');

      try {
        await publish.publishVersion('patch');
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).to.include('uncommitted changes');
      }
    });

    it('should throw when nothing to publish', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');
      await git.tagVersion('1.0.0', 'Release v1.0.0');

      // No new changes since the tag
      try {
        await publish.publishVersion('patch');
        expect.fail('Should have thrown');
      } catch (e) {
        expect((e as Error).message).to.include('Nothing to publish');
      }
    });
  });

  describe('git operations', () => {
    it('should create annotated tag', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      await publish.publishVersion('patch');

      const tags = await testGit(dir).tags();
      expect(tags.all).to.include('v1.0.0');
    });

    it('should create tag with correct annotation message', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      await publish.publishVersion('patch');

      // Verify the annotated tag message
      const tagInfo = await testGit(dir).raw([
        'tag',
        '-l',
        '--format=%(contents:subject)',
        'v1.0.0',
      ]);
      expect(tagInfo.trim()).to.equal('Release v1.0.0');
    });

    it('should push when push=true', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      const pushStub = sinon.stub(git, 'push').resolves();

      await publish.publishVersion('patch', true);

      expect(pushStub.calledOnce).to.be.true;
      expect(pushStub.calledWith({ tags: true })).to.be.true;
    });

    it('should not push when push is false or omitted', async () => {
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await git.commit('change');

      const pushSpy = sinon.spy(git, 'push');

      await publish.publishVersion('patch');

      expect(pushSpy.called).to.be.false;

      // Also test with explicit false
      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await git.commit('another change');

      await publish.publishVersion('patch', false);

      expect(pushSpy.called).to.be.false;
    });
  });
});
