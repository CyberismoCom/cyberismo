import { expect, it, describe, beforeEach, afterEach } from 'vitest';
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
  let gm: GitManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'git-manager-test-'));
    // Create the directories with baseline content (git doesn't track empty dirs)
    await mkdir(join(dir, 'cardRoot'), { recursive: true });
    await mkdir(join(dir, '.cards', 'local'), { recursive: true });
    await writeFile(
      join(dir, '.cards', 'local', 'cardsConfig.json'),
      '{"name": "test"}',
    );
    gm = new GitManager(dir);
    await gm.initialize();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('initialize()', () => {
    it('should create a git repo if none exists', async () => {
      const git = testGit(dir);
      const isRepo = await git.checkIsRepo();
      expect(isRepo).toBe(true);

      // Should have at least one commit (the initial commit)
      const log = await git.log();
      expect(log.total).toBe(1);
    });

    it('should be idempotent on an existing repo', async () => {
      await gm.initialize(); // second call

      const git = testGit(dir);
      const isRepo = await git.checkIsRepo();
      expect(isRepo).toBe(true);

      // Should still have only the initial commit
      const log = await git.log();
      expect(log.total).toBe(1);
    });
  });

  describe('commit()', () => {
    it('should stage and commit changes in cardRoot and .cards', async () => {
      // Create a file in cardRoot
      await writeFile(join(dir, 'cardRoot', 'test.json'), '{"key": "value"}');
      await gm.commit('Test commit');

      const git = testGit(dir);
      const log = await git.log();
      expect(log.latest!.message).toBe('Test commit');
    });

    it('should be a no-op when nothing changed', async () => {
      // Commit the baseline files first
      await gm.commit('Baseline');

      const git = testGit(dir);
      const logBefore = await git.log();
      await gm.commit('Should not appear');
      const logAfter = await git.log();

      expect(logAfter.total).toBe(logBefore.total);
    });

    it('should use per-commit author when provided', async () => {
      const author = { name: 'Test User', email: 'test@example.com' };

      await writeFile(join(dir, 'cardRoot', 'file.txt'), 'content');
      await gm.commit('Authored commit', author);

      const git = testGit(dir);
      const log = await git.log();
      expect(log.latest!.author_name).toBe('Test User');
      expect(log.latest!.author_email).toBe('test@example.com');
    });
  });

  describe('rollback()', () => {
    it('should restore modified files to last committed state', async () => {
      // Commit a file
      const filePath = join(dir, 'cardRoot', 'data.json');
      await writeFile(filePath, 'original');
      await gm.commit('Add data');

      // Modify the file
      await writeFile(filePath, 'modified');
      const contentBefore = await readFile(filePath, 'utf-8');
      expect(contentBefore).toBe('modified');

      // Rollback
      await gm.rollback();

      const contentAfter = await readFile(filePath, 'utf-8');
      expect(contentAfter).toBe('original');
    });

    it('should remove new untracked files', async () => {
      // Create a new untracked file
      const newFile = join(dir, 'cardRoot', 'untracked.txt');
      await writeFile(newFile, 'should be removed');

      // Rollback
      await gm.rollback();

      await expect(readFile(newFile, 'utf-8')).rejects.toThrow('ENOENT');
    });
  });

  describe('tagVersion()', () => {
    it('should create an annotated tag with v prefix', async () => {
      await gm.tagVersion('1.0.0', 'Release v1.0.0');

      const git = testGit(dir);
      const tags = await git.tags();
      expect(tags.all).toContain('v1.0.0');
    });

    it('should use tag name as default message', async () => {
      await gm.tagVersion('2.0.0');

      const git = testGit(dir);
      const tags = await git.tags();
      expect(tags.all).toContain('v2.0.0');
    });
  });

  describe('listVersionTags()', () => {
    it('should return empty array when no tags exist', async () => {
      const tags = await gm.listVersionTags();
      expect(tags).toEqual([]);
    });

    it('should list version tags sorted by version descending', async () => {
      // Create tags in non-sorted order
      await gm.tagVersion('1.0.0');
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await gm.commit('change 1');
      await gm.tagVersion('2.0.0');
      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await gm.commit('change 2');
      await gm.tagVersion('1.1.0');

      const tags = await gm.listVersionTags();
      expect(tags).toEqual(['v2.0.0', 'v1.1.0', 'v1.0.0']);
    });

    it('should return all version tags regardless of branch', async () => {
      const git = testGit(dir);

      // Create v1.0.0 and v1.1.0 on main
      await gm.tagVersion('1.0.0');
      await writeFile(join(dir, 'cardRoot', 'a.txt'), 'a');
      await gm.commit('change 1');
      await gm.tagVersion('1.1.0');

      // Branch off at v1.1.0
      await git.checkoutLocalBranch('maintenance');

      // Go back to main and create v2.0.0
      await git.checkout('master');
      await writeFile(join(dir, 'cardRoot', 'b.txt'), 'b');
      await gm.commit('change 2');
      await gm.tagVersion('2.0.0');

      // Switch to maintenance branch — all tags are still visible
      await git.checkout('maintenance');

      const tags = await gm.listVersionTags();
      expect(tags).toEqual(['v2.0.0', 'v1.1.0', 'v1.0.0']);
    });

    it('should ignore non-version tags', async () => {
      const git = testGit(dir);
      await git.tag(['-a', 'release-1', '-m', 'not a version tag']);
      await gm.tagVersion('1.0.0');

      const tags = await gm.listVersionTags();
      expect(tags).toEqual(['v1.0.0']);
    });
  });

  describe('deleteTag()', () => {
    it('should delete an existing version tag', async () => {
      await gm.tagVersion('1.0.0');

      const before = await gm.listVersionTags();
      expect(before).toContain('v1.0.0');

      await gm.deleteTag('1.0.0');

      const after = await gm.listVersionTags();
      expect(after).not.toContain('v1.0.0');
    });

    it('should throw when tag does not exist', async () => {
      await expect(gm.deleteTag('9.9.9')).rejects.toThrow();
    });
  });

  describe('hasUncommittedChanges()', () => {
    it('should return false on a clean working tree', async () => {
      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).toBe(false);
    });

    it('should return true when there are unstaged changes', async () => {
      await writeFile(join(dir, 'cardRoot', 'dirty.txt'), 'uncommitted');

      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).toBe(true);
    });

    it('should return true when there are staged but uncommitted changes', async () => {
      await writeFile(join(dir, 'cardRoot', 'staged.txt'), 'staged');
      const git = testGit(dir);
      await git.add('cardRoot/staged.txt');

      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).toBe(true);
    });

    it('should ignore untracked files outside project directories', async () => {
      // Create a file outside cardRoot and .cards
      await writeFile(join(dir, 'random-notes.txt'), 'not a project file');

      const dirty = await gm.hasUncommittedChanges();
      expect(dirty).toBe(false);
    });
  });
});
