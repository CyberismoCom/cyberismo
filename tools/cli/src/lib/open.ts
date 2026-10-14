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

import { dirname, join, resolve } from 'node:path';

import {
  createGit,
  openProjectAt,
  SYSTEM_ACTOR,
  Validate,
  type CommitIdentity,
  type Workspace,
  type WorkspaceOptions,
} from '@cyberismo/data-handler';
import {
  pathExists,
  resolveTilde,
} from '@cyberismo/data-handler/utils/file-utils';
import type { ActorRef } from '@cyberismo/model';
import type { AllCommandOptions } from '../options.js';

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
  return isProjectFolder(path) ? path : '';
}

// Whether the folder at 'path' is a project: it has '.cards' and 'cardRoot'.
export function isProjectFolder(path: string): boolean {
  return (
    pathExists(resolve(join(path, '.cards'))) &&
    pathExists(resolve(join(path, 'cardRoot')))
  );
}

// The caller's git author, resolved as git does: GIT_AUTHOR_*, then author.*,
// then user.*. Read with a client of its own: the checkout's forces the Bot.
// The system acts when the name or email is unset.
export async function gitAuthor(
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

// 'path', or its nearest ancestor that exists.
export function existingAncestor(path: string): string {
  const parent = dirname(path);
  return pathExists(path) || parent === path ? path : existingAncestor(parent);
}

// The process's one handle; replaced when a command chain moves to another
// project (e.g. 'create project' and then its first imports).
let open: Workspace | undefined;

/**
 * The caller's handle over the process's one checkout.
 * @param options Resolved project path and the CLI's checkout options.
 */
export async function openProject(
  options: WorkspaceOptions & { projectPath: string },
): Promise<Workspace> {
  const { projectPath, ...checkoutOptions } = options;
  if (open?.path !== projectPath) {
    open = undefined;
    const { actor, identity } = await gitAuthor(projectPath);
    open = await openProjectAt(projectPath, actor, identity, checkoutOptions);
  }
  return open;
}

// The command's project path; refuses one that is not a project.
export function projectPathOf(options: AllCommandOptions): string {
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
  return projectPath;
}

// The handle for a command's project.
export async function openWorkspace(
  options: AllCommandOptions,
): Promise<Workspace> {
  return openProject({
    projectPath: projectPathOf(options),
    logLevel: options.logLevel,
    autocommit: options.autocommit,
    autopush: options.autopush,
  });
}
