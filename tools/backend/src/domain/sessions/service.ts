/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type {
  CommandManager,
  EditSession,
  EditSessionPublishResult,
  EditSessionSaveResult,
} from '@cyberismo/data-handler';

/**
 * List all active edit sessions.
 */
export async function listSessions(
  commands: CommandManager,
): Promise<EditSession[]> {
  return commands.editSessionCmd.listSessions();
}

/**
 * Start a new edit session for a card.
 */
export async function startSession(
  commands: CommandManager,
  cardKey: string,
): Promise<EditSession> {
  // Validate that the card exists before starting session
  commands.project.findCard(cardKey);
  return commands.editSessionCmd.startSession(cardKey);
}

/**
 * Get an edit session by ID.
 */
export async function getSession(
  commands: CommandManager,
  sessionId: string,
): Promise<EditSession | null> {
  return commands.editSessionCmd.getSession(sessionId);
}

/**
 * Get the active session for a card.
 */
export async function getSessionForCard(
  commands: CommandManager,
  cardKey: string,
): Promise<EditSession | null> {
  return commands.editSessionCmd.getSessionForCard(cardKey);
}

/**
 * Save (commit) changes in an edit session.
 */
export async function saveSession(
  commands: CommandManager,
  sessionId: string,
): Promise<EditSessionSaveResult> {
  return commands.editSessionCmd.saveSession(sessionId);
}

/**
 * Publish (merge) an edit session to the main branch.
 */
export async function publishSession(
  commands: CommandManager,
  sessionId: string,
): Promise<EditSessionPublishResult> {
  return commands.editSessionCmd.publishSession(sessionId);
}

/**
 * Discard an edit session.
 */
export async function discardSession(
  commands: CommandManager,
  sessionId: string,
): Promise<void> {
  return commands.editSessionCmd.discardSession(sessionId);
}

/**
 * Check if a card has an active edit session.
 */
export async function hasActiveSession(
  commands: CommandManager,
  cardKey: string,
): Promise<boolean> {
  return commands.editSessionCmd.hasActiveSession(cardKey);
}

/**
 * Clean up orphaned sessions.
 */
export async function cleanup(commands: CommandManager): Promise<void> {
  return commands.editSessionCmd.cleanup();
}
