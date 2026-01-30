/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';

import { GitManager } from './project/git-manager.js';
import { pathExists } from '../utils/file-utils.js';
import { readJsonFile, writeJsonFile } from '../utils/json.js';
import { generateRandomString } from '../utils/random.js';
import { getChildLogger } from '../utils/log-utils.js';

import type {
  EditSession,
  EditSessionPublishResult,
  EditSessionSaveResult,
  PersistedSessions,
} from '../types/edit-session.js';

const SESSIONS_FILE = 'sessions.json';
const SESSIONS_VERSION = 1;

/**
 * Manages edit sessions for cards using Git worktrees.
 *
 * Each edit session:
 * - Creates an isolated Git branch and worktree
 * - Allows editing a card without affecting the main branch
 * - Supports explicit save (commit) and publish (merge) operations
 */
export class EditSessionManager {
  private gitManager: GitManager;
  private sessions: Map<string, EditSession> = new Map();
  private logger = getChildLogger({ module: 'EditSessionManager' });
  private initialized = false;

  constructor(private projectPath: string) {
    this.gitManager = new GitManager(projectPath);
  }

  /**
   * Initialize the session manager by loading persisted sessions.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.loadSessions();
    await this.cleanupOrphanedSessions();
    this.initialized = true;
  }

  /**
   * Get the path to the sessions persistence file.
   */
  private get sessionsFilePath(): string {
    return join(this.gitManager.worktreesFolder, SESSIONS_FILE);
  }

  /**
   * Load persisted sessions from disk.
   */
  private async loadSessions(): Promise<void> {
    try {
      if (pathExists(this.sessionsFilePath)) {
        const data = (await readJsonFile(
          this.sessionsFilePath,
        )) as PersistedSessions;

        if (data.version === SESSIONS_VERSION && data.sessions) {
          for (const [id, session] of Object.entries(data.sessions)) {
            // Only load active sessions
            if (session.status === 'active') {
              this.sessions.set(id, session);
            }
          }
        }

        this.logger.info(
          { sessionCount: this.sessions.size },
          'Loaded persisted sessions',
        );
      }
    } catch (error) {
      this.logger.warn({ error }, 'Failed to load persisted sessions');
    }
  }

  /**
   * Persist sessions to disk.
   */
  private async persistSessions(): Promise<void> {
    try {
      // Ensure worktrees folder exists
      if (!pathExists(this.gitManager.worktreesFolder)) {
        await mkdir(this.gitManager.worktreesFolder, { recursive: true });
      }

      const data: PersistedSessions = {
        version: SESSIONS_VERSION,
        sessions: Object.fromEntries(this.sessions),
      };

      await writeJsonFile(this.sessionsFilePath, data);
    } catch (error) {
      this.logger.error({ error }, 'Failed to persist sessions');
    }
  }

  /**
   * Clean up sessions whose worktrees no longer exist on disk.
   */
  private async cleanupOrphanedSessions(): Promise<void> {
    const orphanedIds: string[] = [];

    for (const [id, session] of this.sessions) {
      if (!pathExists(session.worktreePath)) {
        orphanedIds.push(id);
        this.logger.warn(
          { sessionId: id, cardKey: session.cardKey },
          'Found orphaned session (worktree missing)',
        );
      }
    }

    for (const id of orphanedIds) {
      const session = this.sessions.get(id);
      if (session) {
        // Try to clean up the branch if it exists
        try {
          const branchExists = await this.gitManager.branchExists(
            session.branch,
          );
          if (branchExists) {
            await this.gitManager.deleteBranch(session.branch, true);
          }
        } catch {
          // Ignore errors during cleanup
        }
      }
      this.sessions.delete(id);
    }

    if (orphanedIds.length > 0) {
      await this.persistSessions();
      // Prune Git's worktree tracking
      await this.gitManager.pruneWorktrees();
    }
  }

  /**
   * Generate a unique session ID.
   */
  private generateSessionId(): string {
    return generateRandomString(36, 12);
  }

  /**
   * Generate a branch name for a card edit session.
   */
  private generateBranchName(cardKey: string): string {
    const timestamp = Date.now();
    return `edit/${cardKey}/${timestamp}`;
  }

  /**
   * Generate a worktree path for a session.
   */
  private generateWorktreePath(sessionId: string): string {
    return join(this.gitManager.worktreesFolder, `session-${sessionId}`);
  }

  /**
   * Start a new edit session for a card.
   *
   * @param cardKey The card to edit
   * @returns The created edit session
   * @throws If a session already exists for this card or if Git operations fail
   */
  public async startSession(cardKey: string): Promise<EditSession> {
    await this.initialize();

    // Check if session already exists for this card
    const existingSession = await this.getSessionForCard(cardKey);
    if (existingSession) {
      throw new Error(
        `Edit session already exists for card '${cardKey}' (session: ${existingSession.id})`,
      );
    }

    // Check if project is a Git repository
    const isRepo = await this.gitManager.isGitRepo();
    if (!isRepo) {
      throw new Error('Project is not a Git repository');
    }

    // Check for uncommitted changes in main worktree
    const status = await this.gitManager.getStatus();
    if (!status.isClean) {
      throw new Error(
        'Cannot start edit session: main worktree has uncommitted changes',
      );
    }

    const sessionId = this.generateSessionId();
    const branch = this.generateBranchName(cardKey);
    const worktreePath = this.generateWorktreePath(sessionId);

    this.logger.info(
      { sessionId, cardKey, branch, worktreePath },
      'Starting new edit session',
    );

    try {
      // Ensure worktrees folder exists
      if (!pathExists(this.gitManager.worktreesFolder)) {
        await mkdir(this.gitManager.worktreesFolder, { recursive: true });
      }

      // Create the worktree with a new branch
      await this.gitManager.createWorktree(worktreePath, branch, true);

      const now = new Date().toISOString();
      const session: EditSession = {
        id: sessionId,
        cardKey,
        branch,
        worktreePath,
        createdAt: now,
        lastModified: now,
        status: 'active',
        commitCount: 0,
      };

      this.sessions.set(sessionId, session);
      await this.persistSessions();

      this.logger.info({ sessionId, cardKey }, 'Edit session started');

      return session;
    } catch (error) {
      // Clean up on failure
      this.logger.error({ error, sessionId, cardKey }, 'Failed to start session');

      try {
        if (pathExists(worktreePath)) {
          await this.gitManager.removeWorktree(worktreePath, true);
        }
        const branchExists = await this.gitManager.branchExists(branch);
        if (branchExists) {
          await this.gitManager.deleteBranch(branch, true);
        }
      } catch {
        // Ignore cleanup errors
      }

      throw new Error(
        `Failed to start edit session: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Get a session by ID.
   */
  public async getSession(sessionId: string): Promise<EditSession | null> {
    await this.initialize();
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get the active session for a card, if any.
   */
  public async getSessionForCard(cardKey: string): Promise<EditSession | null> {
    await this.initialize();

    for (const session of this.sessions.values()) {
      if (session.cardKey === cardKey && session.status === 'active') {
        return session;
      }
    }
    return null;
  }

  /**
   * List all active sessions.
   */
  public async listSessions(): Promise<EditSession[]> {
    await this.initialize();
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'active',
    );
  }

  /**
   * Save (commit) changes in an edit session.
   *
   * @param sessionId The session ID
   * @returns Save result with commit hash if successful
   */
  public async saveSession(sessionId: string): Promise<EditSessionSaveResult> {
    await this.initialize();

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: `Session not found: ${sessionId}` };
    }

    if (session.status !== 'active') {
      return {
        success: false,
        message: `Session is not active (status: ${session.status})`,
      };
    }

    // Create a GitManager for the worktree
    const worktreeGit = new GitManager(session.worktreePath);

    try {
      // Check if there are changes to commit
      const status = await worktreeGit.getStatus();
      if (status.isClean) {
        return { success: true, message: 'No changes to save' };
      }

      // Stage all changes
      await worktreeGit.addAll();

      // Get user config for commit
      const userConfig = await worktreeGit.getUserConfig();

      // Commit with a descriptive message
      const commitMessage = `Edit card ${session.cardKey}\n\nSession: ${session.id}\nAuthor: ${userConfig.name} <${userConfig.email}>`;
      const commitHash = await worktreeGit.commit(commitMessage);

      // Update session
      session.lastModified = new Date().toISOString();
      session.commitCount++;
      await this.persistSessions();

      this.logger.info(
        { sessionId, cardKey: session.cardKey, commitHash },
        'Session saved',
      );

      return { success: true, commitHash };
    } catch (error) {
      const message = `Failed to save session: ${error instanceof Error ? error.message : error}`;
      this.logger.error({ error, sessionId }, message);
      return { success: false, message };
    }
  }

  /**
   * Publish (merge) an edit session to the main branch.
   *
   * This uses "theirs" strategy for conflicts - last publish wins.
   *
   * @param sessionId The session ID
   * @returns Publish result
   */
  public async publishSession(
    sessionId: string,
  ): Promise<EditSessionPublishResult> {
    await this.initialize();

    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: `Session not found: ${sessionId}` };
    }

    if (session.status !== 'active') {
      return {
        success: false,
        message: `Session is not active (status: ${session.status})`,
      };
    }

    // First, ensure any pending changes are saved
    const worktreeGit = new GitManager(session.worktreePath);
    const worktreeStatus = await worktreeGit.getStatus();
    if (!worktreeStatus.isClean) {
      const saveResult = await this.saveSession(sessionId);
      if (!saveResult.success) {
        return {
          success: false,
          message: `Failed to save pending changes before publish: ${saveResult.message}`,
        };
      }
    }

    // Check if there are any commits to merge
    if (session.commitCount === 0) {
      // No changes were made, just clean up
      await this.discardSession(sessionId);
      return {
        success: true,
        message: 'No changes to publish, session discarded',
      };
    }

    this.logger.info(
      { sessionId, cardKey: session.cardKey, branch: session.branch },
      'Publishing session',
    );

    try {
      // Ensure we're on main branch
      const currentBranch = await this.gitManager.getCurrentBranch();
      if (currentBranch !== 'main') {
        await this.gitManager.checkout('main');
      }

      // Merge the session branch with "theirs" strategy (last write wins)
      const mergeResult = await this.gitManager.merge(session.branch, 'theirs');

      if (mergeResult.success) {
        // Clean up: remove worktree and branch
        await this.gitManager.removeWorktree(session.worktreePath, true);
        await this.gitManager.deleteBranch(session.branch, true);

        // Update session status
        session.status = 'published';
        this.sessions.delete(sessionId);
        await this.persistSessions();

        this.logger.info(
          { sessionId, cardKey: session.cardKey, commitHash: mergeResult.commitHash },
          'Session published successfully',
        );

        return {
          success: true,
          commitHash: mergeResult.commitHash,
          message: 'Changes published successfully',
        };
      } else {
        // Merge failed - this shouldn't happen with "theirs" strategy
        // but handle it gracefully
        this.logger.error(
          { sessionId, mergeResult },
          'Merge failed despite theirs strategy',
        );

        // Abort the merge
        try {
          await this.gitManager.abortMerge();
        } catch {
          // Ignore abort errors
        }

        return {
          success: false,
          conflicts: mergeResult.conflicts,
          message: mergeResult.message || 'Merge failed',
        };
      }
    } catch (error) {
      const message = `Failed to publish session: ${error instanceof Error ? error.message : error}`;
      this.logger.error({ error, sessionId }, message);

      // Try to abort any in-progress merge
      try {
        await this.gitManager.abortMerge();
      } catch {
        // Ignore abort errors
      }

      return { success: false, message };
    }
  }

  /**
   * Discard an edit session, removing all changes.
   *
   * @param sessionId The session ID
   */
  public async discardSession(sessionId: string): Promise<void> {
    await this.initialize();

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.logger.info(
      { sessionId, cardKey: session.cardKey },
      'Discarding session',
    );

    try {
      // Remove the worktree (force to handle uncommitted changes)
      if (pathExists(session.worktreePath)) {
        await this.gitManager.removeWorktree(session.worktreePath, true);
      }

      // Delete the branch
      const branchExists = await this.gitManager.branchExists(session.branch);
      if (branchExists) {
        await this.gitManager.deleteBranch(session.branch, true);
      }

      // Update session status and remove from active sessions
      session.status = 'discarded';
      this.sessions.delete(sessionId);
      await this.persistSessions();

      this.logger.info({ sessionId }, 'Session discarded');
    } catch (error) {
      const message = `Failed to discard session: ${error instanceof Error ? error.message : error}`;
      this.logger.error({ error, sessionId }, message);
      throw new Error(message);
    }
  }

  /**
   * Get the worktree path for a session.
   * Useful for operations that need to work in the session's isolated environment.
   */
  public async getSessionWorktreePath(
    sessionId: string,
  ): Promise<string | null> {
    const session = await this.getSession(sessionId);
    return session?.worktreePath || null;
  }

  /**
   * Clean up all orphaned worktrees and sessions.
   * Call this periodically or on startup.
   */
  public async cleanup(): Promise<void> {
    await this.initialize();
    await this.cleanupOrphanedSessions();
    await this.gitManager.pruneWorktrees();
  }

  /**
   * Force cleanup of all sessions.
   * Use with caution - this will discard all active edit sessions.
   */
  public async forceCleanupAll(): Promise<void> {
    await this.initialize();

    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.discardSession(sessionId);
      } catch (error) {
        this.logger.warn(
          { error, sessionId },
          'Failed to discard session during force cleanup',
        );
      }
    }

    // Clean up any remaining worktrees in the .worktrees folder
    if (pathExists(this.gitManager.worktreesFolder)) {
      try {
        await rm(this.gitManager.worktreesFolder, {
          recursive: true,
          force: true,
        });
      } catch {
        // Ignore errors
      }
    }

    await this.gitManager.pruneWorktrees();
  }
}
