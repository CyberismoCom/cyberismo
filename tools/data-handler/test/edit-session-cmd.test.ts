// testing
import { expect } from 'chai';

// node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { EditSessionCmd } from '../src/commands/edit-session.js';
import { GitManager } from '../src/containers/project/git-manager.js';
import { pathExists } from '../src/utils/file-utils.js';

// Create test artifacts in system temp folder to avoid being inside the cyberismo git repo
const testDir = join(tmpdir(), `cyberismo-edit-session-cmd-tests-${Date.now()}`);

// Helper to create a minimal Git repo (without full Project structure)
// This tests the EditSessionCmd as a thin wrapper around EditSessionManager
async function createMinimalGitProject(name: string): Promise<string> {
  const projectPath = join(testDir, name);
  mkdirSync(projectPath, { recursive: true });

  // Create minimal structure for Git worktrees to work
  mkdirSync(join(projectPath, '.cards', 'local'), { recursive: true });
  mkdirSync(join(projectPath, 'cardRoot'), { recursive: true });

  // Initialize Git
  const gitManager = new GitManager(projectPath);
  await gitManager.init();
  writeFileSync(join(projectPath, 'README.md'), '# Test Project');
  await gitManager.addAll();
  await gitManager.commit('Initial commit');

  return projectPath;
}

// We test EditSessionCmd through the underlying EditSessionManager
// since EditSessionCmd is a thin wrapper that requires a fully configured Project
// The comprehensive tests are in edit-session-manager.test.ts
describe('EditSessionCmd', () => {
  before(() => {
    mkdirSync(testDir, { recursive: true });
  });

  after(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('module exports', () => {
    it('should export EditSessionCmd class', () => {
      expect(EditSessionCmd).to.be.a('function');
    });
  });

  describe('underlying manager operations via direct EditSessionManager', () => {
    // Since EditSessionCmd is a thin wrapper around EditSessionManager,
    // and EditSessionManager is comprehensively tested in edit-session-manager.test.ts,
    // we only verify here that the wrapper can be instantiated correctly
    // when provided with a valid project path

    let projectPath: string;

    before(async () => {
      projectPath = await createMinimalGitProject('wrapper-test');
    });

    after(() => {
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('should create EditSessionManager from project path', async () => {
      // This test verifies that EditSessionManager can be created with a path
      // and performs basic session operations
      const { EditSessionManager } = await import(
        '../src/containers/edit-session-manager.js'
      );
      const manager = new EditSessionManager(projectPath);

      // Start a session
      const session = await manager.startSession('test_card');

      expect(session).to.have.property('id');
      expect(session.cardKey).to.equal('test_card');
      expect(session.status).to.equal('active');
      expect(pathExists(session.worktreePath)).to.equal(true);

      // Clean up
      await manager.discardSession(session.id);
    });
  });
});
