/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2024
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join, resolve } from 'node:path';

import {
  openProjectAt,
  SYSTEM_ACTOR,
  Validate,
  Workspace,
  type AllCommandOptions,
  type Checkout,
  type CommitIdentity,
  type StartCommandOptions,
  type WorkspaceOptions,
} from '@cyberismo/data-handler';
import {
  pathExists,
  resolveTilde,
} from '@cyberismo/data-handler/utils/file-utils';
import { createGit } from '@cyberismo/data-handler/utils/git-config';
import type { ActorRef } from '@cyberismo/model';

// Nearest folder at or above 'path' that holds '.cards'; '' if none.
function findProjectRoot(path: string): string {
  if (pathExists(resolve(join(path, '.cards')))) {
    return path;
  }
  const parentPath = resolve(path, '..');
  return parentPath === path ? '' : findProjectRoot(parentPath);
}

/**
 * Resolves the project root: '-p' if given, otherwise the nearest project
 * above the current directory. Exits when there is neither.
 * @returns the project path, or '' when it is not a project (it lacks
 * '.cards' or 'cardRoot').
 */
export function projectRoot(options: { projectPath?: string }): string {
  let path = options.projectPath;
  if (!path) {
    path = findProjectRoot(process.cwd());
    if (path === '') {
      console.error(
        'No path defined with "-p" flag and could not find project. Sorry.',
      );
      process.exit(1);
    }
  }
  path = resolveTilde(path);
  const isProject =
    pathExists(resolve(join(path, '.cards'))) &&
    pathExists(resolve(join(path, 'cardRoot')));
  return isProject ? path : '';
}

// The caller's git author, resolved as git does: GIT_AUTHOR_*, then author.*,
// then user.*. Read with a client of its own: the checkout's forces the Bot.
// The system acts when the name or email is unset.
async function gitAuthor(
  path: string,
): Promise<{ actor: ActorRef; identity?: CommitIdentity }> {
  try {
    const git = createGit({ baseDir: path });
    const config = async (key: string) =>
      (await git.getConfig(key)).value ?? undefined;
    const name =
      process.env.GIT_AUTHOR_NAME ||
      (await config('author.name')) ||
      (await config('user.name'));
    const email =
      process.env.GIT_AUTHOR_EMAIL ||
      (await config('author.email')) ||
      (await config('user.email'));
    if (name && email) {
      return {
        actor: { kind: 'user', id: email, name },
        identity: { name, email },
      };
    }
  } catch {
    // No usable git: the system acts.
  }
  return { actor: SYSTEM_ACTOR };
}

// The process's one checkout; replaced when a command chain moves to another
// project (e.g. 'create project' and then its first imports).
let checkout: Checkout | undefined;
process.on('exit', () => checkout?.dispose());

/**
 * The caller's handle over the process's one checkout.
 * @param options Resolved project path and the CLI's checkout options.
 */
export async function openProject(
  options: WorkspaceOptions & { projectPath: string },
): Promise<Workspace> {
  const { projectPath, ...checkoutOptions } = options;
  const { actor, identity } = await gitAuthor(projectPath);
  if (checkout?.basePath !== projectPath) {
    checkout?.dispose();
    checkout = undefined;
    const ws = await openProjectAt(
      projectPath,
      actor,
      identity,
      checkoutOptions,
    );
    checkout = ws.checkout;
    return ws;
  }
  return Workspace.over(checkout, actor, identity);
}

// The handle for a command's project; refuses a path the way the dispatcher does.
export async function openWorkspace(
  options: AllCommandOptions,
): Promise<Workspace> {
  const path = options.projectPath || '';
  const projectPath = resolveTilde(projectRoot(options));
  if (!Validate.validateFolder(projectPath)) {
    const errorMessage =
      path === '' || path === undefined
        ? `No 'cardRoot' in the current folder`
        : `Input validation error: folder name '${path}' is invalid`;
    throw new Error(errorMessage);
  }

  if (!pathExists(projectPath)) {
    throw new Error(`Input validation error: cannot find project '${path}'`);
  }
  return openProject({
    projectPath,
    logLevel: options.logLevel,
    watchResourceChanges: (options as StartCommandOptions).watchResourceChanges,
    autocommit: options.autocommit,
    autopush: options.autopush,
  });
}
