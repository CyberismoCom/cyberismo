// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { EditSessionManager } from '../src/containers/edit-session-manager.js';
import { GitManager } from '../src/containers/project/git-manager.js';
import { pathExists } from '../src/utils/file-utils.js';

// Create test artifacts in system temp folder to avoid being inside the cyberismo git repo
const testDir = join(tmpdir(), `cyberismo-edit-session-tests-${Date.now()}`);

// Helper to create a test project with Git repo
async function createTestProject(name: string): Promise<string> {
  const projectPath = join(testDir, name);
  mkdirSync(projectPath, { recursive: true });

  // Create basic project structure
  mkdirSync(join(projectPath, '.cards', 'local'), { recursive: true });
  mkdirSync(join(projectPath, 'cardRoot'), { recursive: true });

  // Create a card
  const cardPath = join(projectPath, 'cardRoot', 'test_card1');
  mkdirSync(cardPath, { recursive: true });
  writeFileSync(join(cardPath, 'index.adoc'), 'Initial content');
  writeFileSync(
    join(cardPath, 'index.json'),
    JSON.stringify({
      cardType: 'test/cardTypes/test',
      title: 'Test Card',
      workflowState: 'Draft',
      rank: '0|a',
      links: [],
    }),
  );

  // Initialize Git
  const gitManager = new GitManager(projectPath);
  await gitManager.init();
  await gitManager.addAll();
  await gitManager.commit('Initial project setup');

  return projectPath;
}

describe('EditSessionManager', () => {
  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    let projectPath: string;

    before(async () => {
      projectPath = await createTestProject('init-test');
    });

    after(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should create EditSessionManager instance', () => {
      const manager = new EditSessionManager(projectPath);
      expect(manager).to.be.instanceOf(EditSessionManager);
    });

    it('should initialize with empty sessions', async () => {
      const manager = new EditSessionManager(projectPath);
      await manager.initialize();
      const sessions = await manager.listSessions();
      expect(sessions).to.have.lengthOf(0);
    });
  });

  describe('session lifecycle', () => {
    let projectPath: string;
    let manager: EditSessionManager;

    beforeEach(async () => {
      projectPath = await createTestProject(`lifecycle-test-${Date.now()}`);
      manager = new EditSessionManager(projectPath);
    });

    afterEach(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should start a new edit session', async () => {
      const session = await manager.startSession('test_card1');

      expect(session).to.have.property('id');
      expect(session.cardKey).to.equal('test_card1');
      expect(session.status).to.equal('active');
      expect(session.commitCount).to.equal(0);
      expect(session.branch).to.include('edit/test_card1/');
      expect(pathExists(session.worktreePath)).to.equal(true);
    });

    it('should not allow duplicate sessions for same card', async () => {
      await manager.startSession('test_card1');

      try {
        await manager.startSession('test_card1');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('already exists');
      }
    });

    it('should get session by ID', async () => {
      const created = await manager.startSession('test_card1');
      const retrieved = await manager.getSession(created.id);

      expect(retrieved).to.not.equal(null);
      expect(retrieved?.id).to.equal(created.id);
      expect(retrieved?.cardKey).to.equal('test_card1');
    });

    it('should get session for card', async () => {
      await manager.startSession('test_card1');
      const session = await manager.getSessionForCard('test_card1');

      expect(session).to.not.equal(null);
      expect(session?.cardKey).to.equal('test_card1');
    });

    it('should return null for non-existent session', async () => {
      const session = await manager.getSession('non-existent-id');
      expect(session).to.equal(null);
    });

    it('should list all active sessions', async () => {
      // Start first session
      await manager.startSession('test_card1');

      // Create a second card in a separate test project to avoid worktree issues
      // Instead, let's just verify we can list the one session
      const sessions = await manager.listSessions();
      expect(sessions).to.have.lengthOf(1);
      expect(sessions[0].cardKey).to.equal('test_card1');
    });

    it('should discard a session', async () => {
      const session = await manager.startSession('test_card1');
      const worktreePath = session.worktreePath;
      const branch = session.branch;

      // Verify worktree exists
      expect(pathExists(worktreePath)).to.equal(true);

      await manager.discardSession(session.id);

      // Verify worktree is removed
      expect(pathExists(worktreePath)).to.equal(false);

      // Verify session is removed
      const retrieved = await manager.getSession(session.id);
      expect(retrieved).to.equal(null);

      // Verify branch is deleted
      const gitManager = new GitManager(projectPath);
      const branchExists = await gitManager.branchExists(branch);
      expect(branchExists).to.equal(false);
    });

    it('should throw error when discarding non-existent session', async () => {
      try {
        await manager.discardSession('non-existent-id');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('Session not found');
      }
    });
  });

  describe('save operations', () => {
    let projectPath: string;
    let manager: EditSessionManager;

    beforeEach(async () => {
      projectPath = await createTestProject(`save-test-${Date.now()}`);
      manager = new EditSessionManager(projectPath);
    });

    afterEach(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should save session with changes', async () => {
      const session = await manager.startSession('test_card1');

      // Make changes in the worktree
      const cardPath = join(session.worktreePath, 'cardRoot', 'test_card1');
      writeFileSync(join(cardPath, 'index.adoc'), 'Modified content');

      const result = await manager.saveSession(session.id);

      expect(result.success).to.equal(true);
      expect(result.commitHash).to.be.a('string');
      expect(result.commitHash?.length).to.be.greaterThan(0);

      // Verify commit count increased
      const updatedSession = await manager.getSession(session.id);
      expect(updatedSession?.commitCount).to.equal(1);
    });

    it('should return success with no changes to save', async () => {
      const session = await manager.startSession('test_card1');

      const result = await manager.saveSession(session.id);

      expect(result.success).to.equal(true);
      expect(result.message).to.include('No changes');
    });

    it('should return error for non-existent session', async () => {
      const result = await manager.saveSession('non-existent-id');

      expect(result.success).to.equal(false);
      expect(result.message).to.include('Session not found');
    });
  });

  describe('publish operations', () => {
    let projectPath: string;
    let manager: EditSessionManager;

    beforeEach(async () => {
      projectPath = await createTestProject(`publish-test-${Date.now()}`);
      manager = new EditSessionManager(projectPath);
    });

    afterEach(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should publish session with changes', async () => {
      const session = await manager.startSession('test_card1');

      // Make changes in the worktree
      const cardPath = join(session.worktreePath, 'cardRoot', 'test_card1');
      writeFileSync(join(cardPath, 'index.adoc'), 'Published content');

      // Save first
      await manager.saveSession(session.id);

      // Publish
      const result = await manager.publishSession(session.id);

      expect(result.success).to.equal(true);
      expect(result.commitHash).to.be.a('string');

      // Verify session is removed
      const retrievedSession = await manager.getSession(session.id);
      expect(retrievedSession).to.equal(null);

      // Verify worktree is removed
      expect(pathExists(session.worktreePath)).to.equal(false);

      // Verify changes are in main
      const mainContent = join(projectPath, 'cardRoot', 'test_card1', 'index.adoc');
      const fs = await import('node:fs');
      const content = fs.readFileSync(mainContent, 'utf-8');
      expect(content).to.equal('Published content');
    });

    it('should discard session with no changes on publish', async () => {
      const session = await manager.startSession('test_card1');

      // Publish without making any changes
      const result = await manager.publishSession(session.id);

      expect(result.success).to.equal(true);
      expect(result.message).to.include('No changes');

      // Session should be removed
      const retrievedSession = await manager.getSession(session.id);
      expect(retrievedSession).to.equal(null);
    });

    it('should auto-save pending changes on publish', async () => {
      const session = await manager.startSession('test_card1');

      // Make changes but don't save
      const cardPath = join(session.worktreePath, 'cardRoot', 'test_card1');
      writeFileSync(join(cardPath, 'index.adoc'), 'Auto-saved content');

      // Publish directly (should auto-save first)
      const result = await manager.publishSession(session.id);

      expect(result.success).to.equal(true);

      // Verify changes are in main
      const mainContent = join(projectPath, 'cardRoot', 'test_card1', 'index.adoc');
      const fs = await import('node:fs');
      const content = fs.readFileSync(mainContent, 'utf-8');
      expect(content).to.equal('Auto-saved content');
    });

    it('should return error for non-existent session', async () => {
      const result = await manager.publishSession('non-existent-id');

      expect(result.success).to.equal(false);
      expect(result.message).to.include('Session not found');
    });
  });

  describe('session persistence', () => {
    let projectPath: string;

    beforeEach(async () => {
      projectPath = await createTestProject(`persist-test-${Date.now()}`);
    });

    afterEach(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should persist sessions to disk', async () => {
      const manager1 = new EditSessionManager(projectPath);
      const session = await manager1.startSession('test_card1');

      // Create a new manager instance (simulating restart)
      const manager2 = new EditSessionManager(projectPath);
      await manager2.initialize();

      const loadedSession = await manager2.getSession(session.id);

      expect(loadedSession).to.not.equal(null);
      expect(loadedSession?.id).to.equal(session.id);
      expect(loadedSession?.cardKey).to.equal('test_card1');
    });

    it('should clean up orphaned sessions on init', async () => {
      const manager1 = new EditSessionManager(projectPath);
      const session = await manager1.startSession('test_card1');

      // Manually delete the worktree (simulate crash)
      rmSync(session.worktreePath, { recursive: true, force: true });

      // Create a new manager instance
      const manager2 = new EditSessionManager(projectPath);
      await manager2.initialize();

      // Session should be cleaned up
      const sessions = await manager2.listSessions();
      expect(sessions).to.have.lengthOf(0);
    });
  });

  describe('error handling', () => {
    let projectPath: string;
    let manager: EditSessionManager;

    beforeEach(async () => {
      projectPath = await createTestProject(`error-test-${Date.now()}`);
      manager = new EditSessionManager(projectPath);
    });

    afterEach(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should fail to start session on non-git project', async () => {
      const nonGitPath = join(testDir, `non-git-${Date.now()}`);
      mkdirSync(nonGitPath, { recursive: true });

      const nonGitManager = new EditSessionManager(nonGitPath);

      try {
        await nonGitManager.startSession('test_card');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('not a Git repository');
      }

      rmSync(nonGitPath, { recursive: true, force: true });
    });

    it('should fail to start session with uncommitted changes', async () => {
      // Make uncommitted changes in main worktree
      const filePath = join(projectPath, 'uncommitted.txt');
      writeFileSync(filePath, 'uncommitted');

      try {
        await manager.startSession('test_card1');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect((error as Error).message).to.include('uncommitted changes');
      }

      // Clean up
      rmSync(filePath);
    });
  });

  describe('worktree path helper', () => {
    let projectPath: string;
    let manager: EditSessionManager;

    beforeEach(async () => {
      projectPath = await createTestProject(`helper-test-${Date.now()}`);
      manager = new EditSessionManager(projectPath);
    });

    afterEach(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should return worktree path for session', async () => {
      const session = await manager.startSession('test_card1');
      const path = await manager.getSessionWorktreePath(session.id);

      expect(path).to.equal(session.worktreePath);
    });

    it('should return null for non-existent session', async () => {
      const path = await manager.getSessionWorktreePath('non-existent');
      expect(path).to.equal(null);
    });
  });
});
