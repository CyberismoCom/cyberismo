// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { GitManager } from '../src/containers/project/git-manager.js';
import { pathExists } from '../src/utils/file-utils.js';

// Create test artifacts in system temp folder to avoid being inside the cyberismo git repo
const testDir = join(tmpdir(), `cyberismo-git-manager-tests-${Date.now()}`);

// Helper to add a small delay for timestamp-based uniqueness
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('GitManager', () => {
  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    const repoPath = join(testDir, 'init-test');

    beforeEach(() => {
      mkdirSync(repoPath, { recursive: true });
    });

    afterEach(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it('should initialize a new Git repository', async () => {
      const gitManager = new GitManager(repoPath);

      // Before init, should not be a repo (testDir is outside any git repo)
      const isRepoBefore = await gitManager.isGitRepo();
      expect(isRepoBefore).to.equal(false);

      // Initialize
      await gitManager.init();

      // After init, should be a repo
      const isRepoAfter = await gitManager.isGitRepo();
      expect(isRepoAfter).to.equal(true);
    });

    it('should initialize with custom branch name', async () => {
      const gitManager = new GitManager(repoPath);
      await gitManager.init('develop');

      // Need to create a commit to have a branch
      writeFileSync(join(repoPath, 'test.txt'), 'test');
      await gitManager.add(['test.txt']);
      await gitManager.commit('Initial commit');

      const branch = await gitManager.getCurrentBranch();
      expect(branch).to.equal('develop');
    });
  });

  describe('status operations', () => {
    const repoPath = join(testDir, 'status-test');
    let gitManager: GitManager;

    before(async () => {
      mkdirSync(repoPath, { recursive: true });
      gitManager = new GitManager(repoPath);
      await gitManager.init();

      // Create initial commit
      writeFileSync(join(repoPath, 'initial.txt'), 'initial');
      await gitManager.add(['initial.txt']);
      await gitManager.commit('Initial commit');
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it('should return correct status for clean repo', async () => {
      const status = await gitManager.getStatus();

      expect(status.isRepo).to.equal(true);
      expect(status.branch).to.equal('main');
      expect(status.isClean).to.equal(true);
      expect(status.modified).to.have.lengthOf(0);
      expect(status.staged).to.have.lengthOf(0);
      expect(status.untracked).to.have.lengthOf(0);
    });

    it('should detect untracked files', async () => {
      writeFileSync(join(repoPath, 'untracked.txt'), 'untracked');

      const status = await gitManager.getStatus();

      expect(status.isClean).to.equal(false);
      expect(status.untracked).to.include('untracked.txt');

      // Cleanup
      rmSync(join(repoPath, 'untracked.txt'));
    });

    it('should detect modified files', async () => {
      writeFileSync(join(repoPath, 'initial.txt'), 'modified content');

      const status = await gitManager.getStatus();

      expect(status.isClean).to.equal(false);
      expect(status.modified).to.include('initial.txt');

      // Restore
      writeFileSync(join(repoPath, 'initial.txt'), 'initial');
    });

    it('should detect staged files', async () => {
      writeFileSync(join(repoPath, 'staged.txt'), 'staged');
      await gitManager.add(['staged.txt']);

      const status = await gitManager.getStatus();

      expect(status.staged).to.include('staged.txt');

      // Commit to clean up
      await gitManager.commit('Add staged file');
    });

    it('should return status for non-repo path', async () => {
      const nonRepoPath = join(testDir, 'non-repo');
      mkdirSync(nonRepoPath, { recursive: true });

      const nonRepoManager = new GitManager(nonRepoPath);
      const status = await nonRepoManager.getStatus();

      expect(status.isRepo).to.equal(false);
      expect(status.branch).to.equal('');
      expect(status.isClean).to.equal(true);

      rmSync(nonRepoPath, { recursive: true, force: true });
    });
  });

  describe('branch operations', () => {
    const repoPath = join(testDir, 'branch-test');
    let gitManager: GitManager;

    before(async () => {
      mkdirSync(repoPath, { recursive: true });
      gitManager = new GitManager(repoPath);
      await gitManager.init();

      writeFileSync(join(repoPath, 'initial.txt'), 'initial');
      await gitManager.add(['initial.txt']);
      await gitManager.commit('Initial commit');
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it('should create a new branch', async () => {
      await gitManager.createBranch('feature-branch');

      const branches = await gitManager.listBranches();
      expect(branches).to.include('feature-branch');
    });

    it('should check if branch exists', async () => {
      const exists = await gitManager.branchExists('feature-branch');
      expect(exists).to.equal(true);

      const notExists = await gitManager.branchExists('non-existent');
      expect(notExists).to.equal(false);
    });

    it('should checkout a branch', async () => {
      await gitManager.checkout('feature-branch');

      const currentBranch = await gitManager.getCurrentBranch();
      expect(currentBranch).to.equal('feature-branch');

      // Switch back to main
      await gitManager.checkout('main');
    });

    it('should delete a branch', async () => {
      await gitManager.createBranch('to-delete');
      let branches = await gitManager.listBranches();
      expect(branches).to.include('to-delete');

      await gitManager.deleteBranch('to-delete');
      branches = await gitManager.listBranches();
      expect(branches).to.not.include('to-delete');
    });

    it('should list all branches', async () => {
      const branches = await gitManager.listBranches();

      expect(branches).to.include('main');
      expect(branches).to.include('feature-branch');
    });
  });

  describe('commit operations', () => {
    const repoPath = join(testDir, 'commit-test');
    let gitManager: GitManager;

    before(async () => {
      mkdirSync(repoPath, { recursive: true });
      gitManager = new GitManager(repoPath);
      await gitManager.init();
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it('should add files and commit', async () => {
      writeFileSync(join(repoPath, 'test.txt'), 'test content');

      await gitManager.add(['test.txt']);
      const commitHash = await gitManager.commit('Test commit');

      expect(commitHash).to.be.a('string');
      expect(commitHash.length).to.be.greaterThan(0);
    });

    it('should add all files with addAll', async () => {
      writeFileSync(join(repoPath, 'file1.txt'), 'content1');
      writeFileSync(join(repoPath, 'file2.txt'), 'content2');

      await gitManager.addAll();
      await gitManager.commit('Add multiple files');

      const status = await gitManager.getStatus();
      expect(status.isClean).to.equal(true);
    });

    it('should get HEAD commit hash', async () => {
      const headCommit = await gitManager.getHeadCommit();

      expect(headCommit).to.be.a('string');
      expect(headCommit.length).to.be.greaterThan(0);
    });

    it('should check if repository has commits', async () => {
      const hasCommits = await gitManager.hasCommits();
      expect(hasCommits).to.equal(true);
    });
  });

  describe('user config', () => {
    const repoPath = join(testDir, 'config-test');
    let gitManager: GitManager;

    before(async () => {
      mkdirSync(repoPath, { recursive: true });
      gitManager = new GitManager(repoPath);
      await gitManager.init();
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it('should get user config', async () => {
      const config = await gitManager.getUserConfig();

      expect(config).to.have.property('name');
      expect(config).to.have.property('email');
      // Even if not configured, should return defaults
      expect(config.name).to.be.a('string');
      expect(config.email).to.be.a('string');
    });
  });

  describe('worktree operations', () => {
    const repoPath = join(testDir, 'worktree-test');
    let gitManager: GitManager;

    before(async () => {
      mkdirSync(repoPath, { recursive: true });
      gitManager = new GitManager(repoPath);
      await gitManager.init();

      writeFileSync(join(repoPath, 'initial.txt'), 'initial');
      await gitManager.add(['initial.txt']);
      await gitManager.commit('Initial commit');
    });

    after(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it('should generate unique worktree path', async () => {
      const path1 = gitManager.generateWorktreePath('card_abc');
      await delay(2); // Small delay to ensure different timestamp
      const path2 = gitManager.generateWorktreePath('card_abc');

      expect(path1).to.include('.worktrees');
      expect(path1).to.include('card_abc');
      // Paths should be different due to timestamp
      expect(path1).to.not.equal(path2);
    });

    it('should generate unique branch name', async () => {
      const name1 = gitManager.generateBranchName('card_abc');
      await delay(2); // Small delay to ensure different timestamp
      const name2 = gitManager.generateBranchName('card_abc');

      expect(name1).to.include('edit/card_abc/');
      expect(name1).to.not.equal(name2);
    });

    it('should create and list worktrees', async () => {
      const worktreePath = join(repoPath, '.worktrees', 'test-worktree');
      const branchName = 'edit/test/123';

      await gitManager.createWorktree(worktreePath, branchName, true);

      // Verify worktree was created
      expect(pathExists(worktreePath)).to.equal(true);

      // List worktrees
      const worktrees = await gitManager.listWorktrees();
      expect(worktrees.length).to.be.greaterThan(1);

      // Find worktree by branch name (more reliable than path matching on macOS)
      const testWorktree = worktrees.find((w) => w.branch === branchName);
      expect(testWorktree).to.not.equal(undefined);
      expect(testWorktree?.isMain).to.equal(false);
      // Path should end with expected folder name
      expect(testWorktree?.path).to.include('test-worktree');

      // Clean up
      await gitManager.removeWorktree(worktreePath, true);
      await gitManager.deleteBranch(branchName, true);
    });

    it('should identify main worktree', async () => {
      const worktrees = await gitManager.listWorktrees();
      const mainWorktree = worktrees.find((w) => w.isMain);

      expect(mainWorktree).to.not.equal(undefined);
      // Path should contain expected folder name (macOS may resolve symlinks differently)
      expect(mainWorktree?.path).to.include('worktree-test');
    });

    it('should remove worktree', async () => {
      const worktreePath = join(repoPath, '.worktrees', 'to-remove');
      const branchName = 'edit/remove/456';

      await gitManager.createWorktree(worktreePath, branchName, true);
      expect(pathExists(worktreePath)).to.equal(true);

      await gitManager.removeWorktree(worktreePath, true);
      expect(pathExists(worktreePath)).to.equal(false);

      // Clean up branch
      await gitManager.deleteBranch(branchName, true);
    });

    it('should prune worktrees', async () => {
      // This just verifies the command runs without error
      await gitManager.pruneWorktrees();
    });
  });

  describe('merge operations', () => {
    const repoPath = join(testDir, 'merge-test');
    let gitManager: GitManager;

    beforeEach(async () => {
      mkdirSync(repoPath, { recursive: true });
      gitManager = new GitManager(repoPath);
      await gitManager.init();

      writeFileSync(join(repoPath, 'initial.txt'), 'initial');
      await gitManager.add(['initial.txt']);
      await gitManager.commit('Initial commit');
    });

    afterEach(() => {
      rmSync(repoPath, { recursive: true, force: true });
    });

    it('should merge branch successfully (fast-forward)', async () => {
      // Create and checkout feature branch
      await gitManager.createBranch('feature');
      await gitManager.checkout('feature');

      // Make changes on feature branch
      writeFileSync(join(repoPath, 'feature.txt'), 'feature content');
      await gitManager.add(['feature.txt']);
      await gitManager.commit('Add feature');

      // Switch back to main and merge
      await gitManager.checkout('main');
      const result = await gitManager.merge('feature');

      expect(result.success).to.equal(true);
      expect(result.commitHash).to.be.a('string');
    });

    it('should merge with theirs strategy', async () => {
      // Create feature branch
      await gitManager.createBranch('feature');

      // Make changes on main
      writeFileSync(join(repoPath, 'conflict.txt'), 'main content');
      await gitManager.add(['conflict.txt']);
      await gitManager.commit('Main change');

      // Make conflicting changes on feature
      await gitManager.checkout('feature');
      writeFileSync(join(repoPath, 'conflict.txt'), 'feature content');
      await gitManager.add(['conflict.txt']);
      await gitManager.commit('Feature change');

      // Merge back to main with theirs strategy
      await gitManager.checkout('main');
      const result = await gitManager.merge('feature', 'theirs');

      expect(result.success).to.equal(true);
    });
  });

  describe('helper methods', () => {
    it('should get worktrees folder path', () => {
      // Create the directory first since GitManager requires an existing path
      const helperRepoPath = join(testDir, 'helper-test');
      mkdirSync(helperRepoPath, { recursive: true });

      const gitManager = new GitManager(helperRepoPath);
      expect(gitManager.worktreesFolder).to.equal(
        join(helperRepoPath, '.worktrees'),
      );

      rmSync(helperRepoPath, { recursive: true, force: true });
    });

    it('should check if worktrees folder exists', () => {
      const repoPath = join(testDir, 'worktrees-check');
      mkdirSync(repoPath, { recursive: true });

      const gitManager = new GitManager(repoPath);
      expect(gitManager.worktreesFolderExists()).to.equal(false);

      mkdirSync(join(repoPath, '.worktrees'));
      expect(gitManager.worktreesFolderExists()).to.equal(true);

      rmSync(repoPath, { recursive: true, force: true });
    });
  });
});
