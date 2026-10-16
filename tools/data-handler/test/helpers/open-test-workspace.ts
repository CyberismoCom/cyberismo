// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActorRef } from '@cyberismo/model';
import { openProjectAt } from '../../src/api/directory/local-folder.js';
import type { Workspace, WorkspaceOptions } from '../../src/api/workspace.js';
import {
  SYSTEM_ACTOR,
  type CommitIdentity,
} from '../../src/infra/tx/tx-record.js';

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
