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
import {
  localFolder,
  SYSTEM_ACTOR,
  type Checkout,
  type CommitIdentity,
  type ProjectDirectory,
  type Workspace,
  type WorkspaceOptions,
} from '@cyberismo/data-handler';

// The directory each test handle's checkout was opened from.
const directories = new WeakMap<Checkout, ProjectDirectory>();

/**
 * Opens the project at `path` through a directory of its own and returns a
 * handle over it; the test disposes the checkout. The system acts unless an
 * actor is given; options (e.g. autocommit) pass through.
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
  directories.set(ws.checkout, directory);
  return ws;
}

/** The directory `ws` was opened from by openTestWorkspace. */
export function directoryOf(ws: Workspace): ProjectDirectory {
  const directory = directories.get(ws.checkout);
  if (!directory) {
    throw new Error('The handle was not opened by openTestWorkspace');
  }
  return directory;
}
