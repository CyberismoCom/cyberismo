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

import type { Project } from '../containers/project.js';
import { EditSessionManager } from '../containers/edit-session-manager.js';
import type {
  EditSession,
  EditSessionPublishResult,
  EditSessionSaveResult,
} from '../types/edit-session.js';

/**
 * Command handler for edit session operations.
 *
 * Edit sessions provide isolated editing environments for cards using Git worktrees.
 * Each session creates a separate branch and worktree, allowing changes to be
 * saved (committed) and published (merged) independently.
 */
export class EditSessionCmd {
  private sessionManager: EditSessionManager;

  constructor(private project: Project) {
    this.sessionManager = new EditSessionManager(project.basePath);
  }

  /**
   * Start a new edit session for a card.
   *
   * Creates an isolated Git worktree and branch for editing the specified card.
   * Only one session can be active for a card at a time.
   *
   * Note: This method does not validate that the card exists in the project.
   * Card validation should be done at the API layer before calling this method.
   *
   * @param cardKey The card to edit
   * @returns The created edit session
   * @throws If a session already exists for this card or Git operations fail
   */
  public async startSession(cardKey: string): Promise<EditSession> {
    return this.sessionManager.startSession(cardKey);
  }

  /**
   * Get an edit session by ID.
   *
   * @param sessionId The session ID
   * @returns The session if found, null otherwise
   */
  public async getSession(sessionId: string): Promise<EditSession | null> {
    return this.sessionManager.getSession(sessionId);
  }

  /**
   * Get the active session for a card.
   *
   * @param cardKey The card key
   * @returns The active session if one exists, null otherwise
   */
  public async getSessionForCard(cardKey: string): Promise<EditSession | null> {
    return this.sessionManager.getSessionForCard(cardKey);
  }

  /**
   * List all active edit sessions.
   *
   * @returns Array of active sessions
   */
  public async listSessions(): Promise<EditSession[]> {
    return this.sessionManager.listSessions();
  }

  /**
   * Save (commit) changes in an edit session.
   *
   * Commits all staged and unstaged changes in the session's worktree.
   * The commit message includes the card key and session ID.
   *
   * @param sessionId The session ID
   * @returns Save result with commit hash if successful
   */
  public async saveSession(sessionId: string): Promise<EditSessionSaveResult> {
    return this.sessionManager.saveSession(sessionId);
  }

  /**
   * Publish (merge) an edit session to the main branch.
   *
   * This merges the session's branch into main using "theirs" strategy
   * (last write wins) for conflict resolution. After successful merge,
   * the worktree and branch are cleaned up.
   *
   * @param sessionId The session ID
   * @returns Publish result with commit hash if successful
   */
  public async publishSession(
    sessionId: string,
  ): Promise<EditSessionPublishResult> {
    return this.sessionManager.publishSession(sessionId);
  }

  /**
   * Discard an edit session.
   *
   * Removes the worktree and deletes the branch, discarding all changes.
   *
   * @param sessionId The session ID
   * @throws If session not found
   */
  public async discardSession(sessionId: string): Promise<void> {
    return this.sessionManager.discardSession(sessionId);
  }

  /**
   * Get the worktree path for a session.
   *
   * Use this to perform operations in the session's isolated environment.
   *
   * @param sessionId The session ID
   * @returns The worktree path if session exists, null otherwise
   */
  public async getSessionWorktreePath(
    sessionId: string,
  ): Promise<string | null> {
    return this.sessionManager.getSessionWorktreePath(sessionId);
  }

  /**
   * Check if a card has an active edit session.
   *
   * @param cardKey The card key
   * @returns True if an active session exists for this card
   */
  public async hasActiveSession(cardKey: string): Promise<boolean> {
    const session = await this.sessionManager.getSessionForCard(cardKey);
    return session !== null;
  }

  /**
   * Clean up orphaned sessions.
   *
   * Call this periodically or on startup to clean up sessions
   * whose worktrees no longer exist.
   */
  public async cleanup(): Promise<void> {
    return this.sessionManager.cleanup();
  }

  /**
   * Force cleanup all sessions.
   *
   * Use with caution - this will discard ALL active edit sessions.
   */
  public async forceCleanupAll(): Promise<void> {
    return this.sessionManager.forceCleanupAll();
  }
}
