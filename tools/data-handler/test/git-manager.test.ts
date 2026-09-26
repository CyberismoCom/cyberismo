import { expect, it, describe, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  realpath,
  rename,
  rm,
} from 'node:fs/promises';
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
    vi.unstubAllGlobals();
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

    it('should commit a change that only renames files', async () => {
      await writeFile(join(dir, 'cardRoot', 'before.txt'), 'content');
      await gm.commit('Add');
      await rename(
        join(dir, 'cardRoot', 'before.txt'),
        join(dir, 'cardRoot', 'after.txt'),
      );
      await gm.commit('Rename');

      const log = await testGit(dir).log();
      expect(log.latest!.message).toBe('Rename');
      expect(await gm.hasUncommittedChanges()).toBe(false);
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

    it('should append trailers as the last paragraph', async () => {
      await writeFile(join(dir, 'cardRoot', 'file.txt'), 'content');
      await gm.commit('With trailers', undefined, {
        'Cyberismo-Actor': 'agent',
        'Cyberismo-Agent': 'claude-code',
      });

      const git = testGit(dir);
      const trailers = await git.raw([
        'log',
        '-1',
        '--format=%(trailers:only,unfold)',
      ]);
      expect(trailers.trim()).toBe(
        'Cyberismo-Actor: agent\nCyberismo-Agent: claude-code',
      );
      const subject = await git.raw(['log', '-1', '--format=%s']);
      expect(subject.trim()).toBe('With trailers');
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
      const message = await git.raw(['tag', '-l', '-n1', 'v1.0.0']);
      expect(message).toContain('Release v1.0.0');
    });

    it('should use tag name as default message', async () => {
      await gm.tagVersion('2.0.0');

      const git = testGit(dir);
      const tags = await git.tags();
      expect(tags.all).toContain('v2.0.0');
      const message = await git.raw(['tag', '-l', '-n1', 'v2.0.0']);
      expect(message).toContain('v2.0.0');
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
  describe('push()', () => {
    it('pushes the branch and sets its upstream', async () => {
      // Covers the argument list itself, which carries `-u` and `--progress`
      // alongside the refspec. `origin` is a bare repo on disk, so no network.
      const origin = await mkdtemp(join(tmpdir(), 'git-manager-origin-'));
      try {
        await simpleGit(origin).init(true);
        await gm.setRemoteUrl(origin);

        await gm.push({ remote: 'origin' });

        const local = await testGit(dir).revparse(['HEAD']);
        expect(await simpleGit(origin).revparse(['HEAD'])).toBe(local);
        const branch = (await testGit(dir).branch()).current;
        expect(
          (
            await testGit(dir).revparse(['--abbrev-ref', `${branch}@{u}`])
          ).trim(),
        ).toBe(`origin/${branch}`);
      } finally {
        await rm(origin, { recursive: true, force: true });
      }
    });
  });

  describe('changeSet primitives', { timeout: 30_000 }, () => {
    let worktree: string;

    beforeEach(async () => {
      worktree = join(
        await mkdtemp(join(tmpdir(), 'git-manager-worktree-')),
        'wt',
      );
    });

    afterEach(async () => {
      await rm(join(worktree, '..'), { recursive: true, force: true });
    });

    it('locates the project inside its repository', async () => {
      expect(await gm.pathInRepo()).toBe('');

      const nested = join(dir, 'projects', 'one');
      await mkdir(join(nested, 'cardRoot'), { recursive: true });
      expect(await new GitManager(nested).pathInRepo()).toBe('projects/one');
    });

    it('isolates work on a branch in a worktree', async () => {
      // git tracks no empty folders: give cardRoot content to check out
      await writeFile(join(dir, 'cardRoot', 'base.txt'), 'base');
      await gm.commit('Base');
      const base = await gm.headCommit();
      await gm.addWorktree(worktree, 'changesets/one', base);
      expect(
        (await gm.listWorktrees()).find(
          (item) => item.branch === 'changesets/one',
        ),
      ).toEqual({
        path: await realpath(worktree),
        head: base,
        branch: 'changesets/one',
      });

      await writeFile(join(worktree, 'cardRoot', 'card.txt'), 'in worktree');
      await new GitManager(worktree).commit(
        'Worktree edit',
        { name: 'Alice', email: 'alice@example.com' },
        { 'Cyberismo-Actor': 'agent' },
      );

      expect(await gm.headCommit()).toBe(base);
      expect(await gm.mergeBase(base, 'changesets/one')).toBe(base);
      expect(await gm.changedFiles(base, 'changesets/one')).toEqual([
        { status: 'A', path: 'cardRoot/card.txt' },
      ]);
      expect(await gm.showFile('changesets/one', 'cardRoot/card.txt')).toBe(
        'in worktree',
      );
      expect(await gm.showFile(base, 'cardRoot/card.txt')).toBeNull();
      expect(await gm.log(base, 'changesets/one')).toEqual([
        {
          hash: expect.any(String),
          author: { name: 'Alice', email: 'alice@example.com' },
          date: expect.any(String),
          subject: 'Worktree edit',
          trailers: { 'Cyberismo-Actor': 'agent' },
          files: ['cardRoot/card.txt'],
        },
      ]);

      await gm.removeWorktree(worktree);
      await gm.deleteBranch('changesets/one', true);
      expect(
        (await gm.listWorktrees()).map((item) => item.branch),
      ).not.toContain('changesets/one');
    });

    it('reports a moved card folder as a rename', async () => {
      await mkdir(join(dir, 'cardRoot', 'a'), { recursive: true });
      await writeFile(
        join(dir, 'cardRoot', 'a', 'index.adoc'),
        'long enough content to be recognised as the same file',
      );
      await gm.commit('Add card');
      const before = await gm.headCommit();
      await mkdir(join(dir, 'cardRoot', 'b'), { recursive: true });
      await rename(
        join(dir, 'cardRoot', 'a', 'index.adoc'),
        join(dir, 'cardRoot', 'b', 'index.adoc'),
      );
      await gm.commit('Move card');

      expect(await gm.changedFiles(before, 'HEAD')).toEqual([
        {
          status: 'R',
          from: 'cardRoot/a/index.adoc',
          path: 'cardRoot/b/index.adoc',
          similarity: 100,
        },
      ]);
    });

    it('forgets worktrees whose folders are gone', async () => {
      await gm.addWorktree(worktree, 'changesets/gone', await gm.headCommit());
      await rm(worktree, { recursive: true, force: true });
      await gm.pruneWorktrees();
      expect(
        (await gm.listWorktrees()).map((item) => item.branch),
      ).not.toContain('changesets/gone');
    });

    it('reads many files at commits in one go', async () => {
      await writeFile(join(dir, 'cardRoot', 'one.txt'), 'first');
      await gm.commit('One');
      const first = await gm.headCommit();
      await writeFile(join(dir, 'cardRoot', 'one.txt'), 'second ✓');
      await gm.commit('Two');

      expect(
        await gm.readFiles([
          { ref: first, path: 'cardRoot/one.txt' },
          { ref: 'HEAD', path: 'cardRoot/one.txt' },
          { ref: 'HEAD', path: 'cardRoot/missing.txt' },
        ]),
      ).toEqual(['first', 'second ✓', null]);
    });

    it('merges without committing and reports conflicts', async () => {
      await writeFile(join(dir, 'cardRoot', 'shared.txt'), 'base\n');
      await gm.commit('Base');
      const base = await gm.headCommit();
      await gm.addWorktree(worktree, 'changesets/merge', base);
      const other = new GitManager(worktree);
      await writeFile(join(worktree, 'cardRoot', 'shared.txt'), 'theirs\n');
      await other.commit('Theirs');
      await writeFile(join(dir, 'cardRoot', 'shared.txt'), 'ours\n');
      await gm.commit('Ours');

      expect(await gm.mergeNoCommit('changesets/merge')).toEqual([
        'cardRoot/shared.txt',
      ]);
      expect(await gm.conflictSide(1, 'cardRoot/shared.txt')).toBe('base\n');
      expect(await gm.conflictSide(2, 'cardRoot/shared.txt')).toBe('ours\n');
      expect(await gm.conflictSide(3, 'cardRoot/shared.txt')).toBe('theirs\n');

      await gm.abortMerge();
      // A Windows checkout may hold CRLF
      const restored = await readFile(
        join(dir, 'cardRoot', 'shared.txt'),
        'utf-8',
      );
      expect(restored.replace(/\r\n/g, '\n')).toBe('ours\n');
      await gm.removeWorktree(worktree, true);
    });
  });
});
