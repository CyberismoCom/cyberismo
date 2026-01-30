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

/**
 * Status of an edit session.
 */
export type EditSessionStatus = 'active' | 'published' | 'discarded';

/**
 * Represents an active edit session for a card.
 * Each session creates an isolated Git worktree for editing.
 */
export interface EditSession {
  /** Unique session identifier */
  id: string;

  /** The card being edited */
  cardKey: string;

  /** Git branch name for this session */
  branch: string;

  /** Absolute path to the worktree directory */
  worktreePath: string;

  /** ISO timestamp when the session was created */
  createdAt: string;

  /** ISO timestamp of the last save (commit) */
  lastModified: string;

  /** Current session status */
  status: EditSessionStatus;

  /** Number of commits made in this session */
  commitCount: number;
}

/**
 * Input for creating a new edit session.
 */
export interface EditSessionCreate {
  /** The card to edit */
  cardKey: string;
}

/**
 * Result of publishing (merging) an edit session.
 */
export interface EditSessionPublishResult {
  /** Whether the publish was successful */
  success: boolean;

  /** The merge commit hash if successful */
  commitHash?: string;

  /** List of conflicting files if merge failed */
  conflicts?: string[];

  /** Human-readable message about the result */
  message?: string;
}

/**
 * Result of saving (committing) an edit session.
 */
export interface EditSessionSaveResult {
  /** Whether the save was successful */
  success: boolean;

  /** The commit hash if successful */
  commitHash?: string;

  /** Error message if save failed */
  message?: string;
}

/**
 * Persisted format for sessions (stored in sessions.json).
 */
export interface PersistedSessions {
  /** Schema version for future compatibility */
  version: number;

  /** Map of session ID to session data */
  sessions: Record<string, EditSession>;
}
