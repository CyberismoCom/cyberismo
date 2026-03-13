/* eslint-disable @typescript-eslint/no-unused-expressions */

import { expect } from 'chai';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';

import { GitManager } from '../src/utils/git-manager.js';

/** Create a simpleGit instance with a test identity so tests work without global git config. */
function testGit(dir: string) {
  return simpleGit(dir, {
    config: ['user.name=Test', 'user.email=test@test.com'],
  });
}

describe('GitManager', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'git-manager-test-'));
    // Create the directories with baseline content (git doesn't track empty dirs)
    await mkdir(join(dir, 'cardRoot'), { recursive: true });
    await mkdir(join(dir, '.cards', 'local'), { recursive: true });
    await writeFile(
      join(dir, '.cards', 'local', 'cardsConfig.json'),
      '{"name": "test"}',
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('initialize()', () => {
    it('should create a git repo if none exists', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      const git = testGit(dir);
      const isRepo = await git.checkIsRepo();
      expect(isRepo).to.equal(true);

      // Should have at least one commit (the initial commit)
      const log = await git.log();
      expect(log.total).to.be.greaterThanOrEqual(1);
    });

    it('should be idempotent on an existing repo', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();
      await gm.initialize(); // second call

      const git = testGit(dir);
      const isRepo = await git.checkIsRepo();
      expect(isRepo).to.equal(true);

      // Should still have only the initial commit
      const log = await git.log();
      expect(log.total).to.equal(1);
    });
  });

  describe('commit()', () => {
    it('should stage and commit changes in cardRoot and .cards', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      // Create a file in cardRoot
      await writeFile(join(dir, 'cardRoot', 'test.json'), '{"key": "value"}');
      await gm.commit('Test commit');

      const git = testGit(dir);
      const log = await git.log();
      expect(log.latest!.message).to.equal('Test commit');
    });

    it('should be a no-op when nothing changed', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      // Commit the baseline files first
      await gm.commit('Baseline');

      const git = testGit(dir);
      const logBefore = await git.log();
      await gm.commit('Should not appear');
      const logAfter = await git.log();

      expect(logAfter.total).to.equal(logBefore.total);
    });

    it('should use per-commit author when provided', async () => {
      const author = { name: 'Test User', email: 'test@example.com' };
      const gm = new GitManager(dir);
      await gm.initialize();

      await writeFile(join(dir, 'cardRoot', 'file.txt'), 'content');
      await gm.commit('Authored commit', author);

      const git = testGit(dir);
      const log = await git.log();
      expect(log.latest!.author_name).to.equal('Test User');
      expect(log.latest!.author_email).to.equal('test@example.com');
    });
  });

  describe('rollback()', () => {
    it('should restore modified files to last committed state', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      // Commit a file
      const filePath = join(dir, 'cardRoot', 'data.json');
      await writeFile(filePath, 'original');
      await gm.commit('Add data');

      // Modify the file
      await writeFile(filePath, 'modified');
      const contentBefore = await readFile(filePath, 'utf-8');
      expect(contentBefore).to.equal('modified');

      // Rollback
      await gm.rollback();

      const contentAfter = await readFile(filePath, 'utf-8');
      expect(contentAfter).to.equal('original');
    });

    it('should remove new untracked files', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      // Create a new untracked file
      const newFile = join(dir, 'cardRoot', 'untracked.txt');
      await writeFile(newFile, 'should be removed');

      // Rollback
      await gm.rollback();

      // File should be gone
      try {
        await readFile(newFile, 'utf-8');
        expect.fail('File should have been removed');
      } catch (e) {
        expect((e as NodeJS.ErrnoException).code).to.equal('ENOENT');
      }
    });
  });

  describe('tagVersion()', () => {
    it('should create an annotated tag with v prefix', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await gm.tagVersion('1.0.0', 'Release v1.0.0');

      const git = testGit(dir);
      const tags = await git.tags();
      expect(tags.all).to.include('v1.0.0');
    });

    it('should use tag name as default message', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await gm.tagVersion('2.0.0');

      const git = testGit(dir);
      const tags = await git.tags();
      expect(tags.all).to.include('v2.0.0');
    });
  });

  describe('listVersionTags()', () => {
    it('should return empty array when no tags exist', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      const tags = await gm.listVersionTags();
      expect(tags).to.deep.equal([]);
    });

    it('should list version tags sorted by version descending', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      // Create tags in non-sorted order
      await gm.tagVersion('1.0.0');
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await gm.commit('change 1');
      await gm.tagVersion('2.0.0');
      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await gm.commit('change 2');
      await gm.tagVersion('1.1.0');

      const tags = await gm.listVersionTags();
      expect(tags).to.deep.equal(['v2.0.0', 'v1.1.0', 'v1.0.0']);
    });

    it('should ignore non-version tags', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      const git = testGit(dir);
      await git.tag(['-a', 'release-1', '-m', 'not a version tag']);
      await gm.tagVersion('1.0.0');

      const tags = await gm.listVersionTags();
      expect(tags).to.deep.equal(['v1.0.0']);
    });
  });

  describe('getVersion()', () => {
    it('should return null when no version tags exist', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      const version = await gm.getVersion();
      expect(version).to.be.null;
    });

    it('should return the latest version', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await gm.tagVersion('1.0.0');
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await gm.commit('change');
      await gm.tagVersion('1.1.0');

      const version = await gm.getVersion();
      expect(version).to.equal('1.1.0');
    });

    it('should return highest version even if created out of order', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await gm.tagVersion('2.0.0');
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await gm.commit('change');
      await gm.tagVersion('1.5.0');

      const version = await gm.getVersion();
      expect(version).to.equal('2.0.0');
    });
  });

  describe('hasChangesSinceVersion()', () => {
    it('should return false when no changes since version', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await gm.tagVersion('1.0.0');

      const hasChanges = await gm.hasChangesSinceVersion('1.0.0');
      expect(hasChanges).to.equal(false);
    });

    it('should return true when there are committed changes since version', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await gm.tagVersion('1.0.0');
      await writeFile(join(dir, 'cardRoot', 'new.txt'), 'content');
      await gm.commit('new change');

      const hasChanges = await gm.hasChangesSinceVersion('1.0.0');
      expect(hasChanges).to.equal(true);
    });
  });

  describe('hasUncommittedChanges()', () => {
    it('should return false on a clean working tree', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).to.equal(false);
    });

    it('should return true when there are unstaged changes', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await writeFile(join(dir, 'cardRoot', 'dirty.txt'), 'uncommitted');

      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).to.equal(true);
    });

    it('should return true when there are staged but uncommitted changes', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      await writeFile(join(dir, 'cardRoot', 'staged.txt'), 'staged');
      const git = testGit(dir);
      await git.add('cardRoot/staged.txt');

      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).to.equal(true);
    });

    it('should ignore untracked files outside project directories', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      // Create a file outside cardRoot and .cards
      await writeFile(join(dir, 'random-notes.txt'), 'not a project file');

      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).to.equal(false);
    });
  });
});
