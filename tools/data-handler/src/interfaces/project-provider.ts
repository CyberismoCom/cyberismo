/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026

  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { CommandManager } from '../command-manager.js';
import type {
  ChangeSetChanges,
  ChangeSetInfo,
} from '../changesets/change-set-manager.js';

/**
 * The caller's changeSets in the provider's projects.
 */
export interface ChangeSetAccess {
  /** The caller's active changeSet in a project, if any. */
  active(prefix: string): Promise<ChangeSetInfo | undefined>;
  /** Starts a changeSet in a project and makes it the caller's active one. */
  start(prefix: string, title: string): Promise<ChangeSetInfo>;
  /** What the caller's active changeSet changes; undefined without one. */
  changes(prefix: string): Promise<ChangeSetChanges | undefined>;
}

/**
 * Minimal interface for project lookup by prefix.
 * Implemented by ProjectRegistry in the backend and used by the MCP server.
 */
export interface ProjectProvider {
  get(prefix: string): CommandManager | undefined;
  list(): { prefix: string; name: string }[];
  /**
   * The CommandManager to serve the caller from: their active changeSet's
   * when they have one, else the project's own. Absent: get().
   */
  resolve?(prefix: string): Promise<CommandManager | undefined>;
  /** Present when the provider knows its caller's changeSets. */
  changeSets?: ChangeSetAccess;
}
