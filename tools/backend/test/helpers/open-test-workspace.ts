// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { ActorRef } from '@cyberismo/model';
import {
  localFolder,
  SYSTEM_ACTOR,
  type CommitIdentity,
  type ProjectDirectory,
  type Workspace,
  type WorkspaceOptions,
} from '@cyberismo/data-handler';

// The directory each test handle was opened from.
const directories = new WeakMap<Workspace, ProjectDirectory>();

/**
 * Opens the project at `path` through a directory of its own and returns a
 * handle over it. The system acts unless an actor is given; options (e.g.
 * autocommit) pass through.
 * @throws if the project does not load.
 */
export async function openTestWorkspace(
  path: string,
  {
    actor = SYSTEM_ACTOR,
    identity,
    ...options
  }: WorkspaceOptions & { actor?: ActorRef; identity?: CommitIdentity } = {},
): Promise<Workspace> {
  const { directory, failed } = await localFolder(path, options);
  if (failed.length > 0) {
    throw new Error(failed.flatMap(({ errors }) => errors).join('\n'));
  }
  const [project] = await directory.list();
  const ws = await directory.open(project.prefix, actor, identity);
  directories.set(ws, directory);
  return ws;
}

/** The directory `ws` was opened from by openTestWorkspace. */
export function directoryOf(ws: Workspace): ProjectDirectory {
  const directory = directories.get(ws);
  if (!directory) {
    throw new Error('The handle was not opened by openTestWorkspace');
  }
  return directory;
}
