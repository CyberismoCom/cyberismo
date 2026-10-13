/**
    Cyberismo
    Copyright © Cyberismo Ltd and contributors 2026

    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License version 3 as published by the Free Software Foundation.

    This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public
    License along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Who performed a write. Carries no email: the git author is kept apart,
 * inside data-handler.
 */
export interface ActorRef {
  /** 'connector' is a service account; 'system' is Cyberismo itself. */
  kind: 'user' | 'connector' | 'system';
  id: string;
  name: string;
  /** Set when an agent (e.g. an MCP client) acted for the actor. */
  agent?: { name: string };
}
