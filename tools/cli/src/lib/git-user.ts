// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { simpleGit } from 'simple-git';

/** The git identity of the local user. A value that git does not have is undefined. */
export interface GitUser {
  name?: string;
  email?: string;
}

/**
 * Reads user.name and user.email from the git configuration.
 * @param baseDir Directory whose git configuration is read. Default: the current directory.
 */
export async function gitUser(baseDir?: string): Promise<GitUser> {
  const git = baseDir ? simpleGit(baseDir) : simpleGit();
  const name = (await git.getConfig('user.name')).value || undefined;
  const email = (await git.getConfig('user.email')).value || undefined;
  return { name, email };
}
