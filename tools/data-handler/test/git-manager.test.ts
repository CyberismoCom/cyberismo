import { expect } from 'chai';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { simpleGit } from 'simple-git';

import { GitManager } from '../src/utils/git-manager.js';

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

      const git = simpleGit(dir);
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

      const git = simpleGit(dir);
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

      const git = simpleGit(dir);
      const log = await git.log();
      expect(log.latest!.message).to.equal('Test commit');
    });

    it('should be a no-op when nothing changed', async () => {
      const gm = new GitManager(dir);
      await gm.initialize();

      // Commit the baseline files first
      await gm.commit('Baseline');

      const git = simpleGit(dir);
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

      const git = simpleGit(dir);
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
});
