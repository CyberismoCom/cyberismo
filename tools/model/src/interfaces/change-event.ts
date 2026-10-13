/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import type { ActorRef } from './actor.js';

/**
 * Why a change event was published. 'rename' and 'failed-write' come with
 * a 'project.reloaded' change: everything may have changed.
 */
export type ChangeCause = 'direct' | 'rename' | 'failed-write';

/** One thing a write changed. Carries keys and names, never content. */
export type Change =
  | { kind: 'card.updated' | 'card.removed'; key: string }
  | { kind: 'resource.changed'; name: string }
  | { kind: 'module.changed'; name: string }
  | { kind: 'settings.changed' }
  | { kind: 'project.reloaded' };

/** What one write transaction changed in a workspace, and who made it. */
export interface ChangeEvent {
  /** Prefix of the project. */
  project: string;
  workspace: 'main';
  /** Identifies one opening of the workspace; revisions restart with it. */
  epoch: string;
  revision: number;
  /** Full SHA of the write's commit, when it made one. */
  commit?: string;
  actor: ActorRef;
  cause: ChangeCause;
  /** ISO 8601 time of publishing. */
  at: string;
  changes: Change[];
}
