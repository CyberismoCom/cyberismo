/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import type { ActorRef } from '@cyberismo/model';
import { openProjectAt } from '../../src/directory/local-folder.js';
import type {
  Workspace,
  WorkspaceOptions,
} from '../../src/workspace/workspace.js';
import {
  SYSTEM_ACTOR,
  type CommitIdentity,
} from '../../src/utils/tx-record.js';

/**
 * Opens a fresh checkout at `path` and returns a handle over it. The system
 * acts unless an actor is given; options (e.g. autocommit) pass through.
 */
export async function openTestWorkspace(
  path: string,
  {
    actor = SYSTEM_ACTOR,
    identity,
    ...options
  }: WorkspaceOptions & { actor?: ActorRef; identity?: CommitIdentity } = {},
): Promise<Workspace> {
  return openProjectAt(path, actor, identity, options);
}
