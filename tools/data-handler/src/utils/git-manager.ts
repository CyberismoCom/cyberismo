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

import semver from 'semver';
import { createGit, gitTimeout } from './git-config.js';
import { getChildLogger } from './log-utils.js';
import { stripTagPrefix, versionToTag } from '../modules/version.js';

/** A file that differs between two commits, relative to the project. */
export interface ChangedFile {
  /** A: added, M: modified, D: deleted, R: renamed (with 'from'), T: type. */
  status: 'A' | 'M' | 'D' | 'R' | 'T';
  path: string;
  from?: string;
}

/** A commit, with the trailers recording its provenance. */
export interface CommitInfo {
  hash: string;
  author: { name: string; email: string };
  date: string;
  subject: string;
  trailers: Record<string, string>;
}

/** A git worktree of the repository. */
export interface WorktreeInfo {
  path: string;
  head: string;
  branch?: string;
}

// Project folders that hold content; everything else is outside a project's
// history as far as the app is concerned.
const CONTENT_PATHS = ['cardRoot', '.cards'];

export class GitManager {
  private git: ReturnType<typeof createGit>;
  private logger = getChildLogger({ module: 'GitManager' });

  constructor(projectPath: string) {
    this.git = createGit({
      baseDir: projectPath,
      timeout: gitTimeout(),
      config: ['user.name=Cyberismo Bot', 'user.email=bot@cyberismo.com'],
    });
  }

  /** Ensure the project is a git repo. Idempotent. */
  async initialize(author?: { name: string; email: string }): Promise<void> {
    const isRepo = await this.git.checkIsRepo();
    if (!isRepo) {
      await this.git.init();
      // Initial commit so rollback has a baseline
      await this.git.add('.');
      const commitOpts: Record<string, string | null> = {
        '--allow-empty': null,
      };
      if (author) {
        commitOpts['--author'] = `${author.name} <${author.email}>`;
      }
      await this.git.commit('Initial commit', undefined, commitOpts);
      this.logger.info('New repo created with baseline commit');
    } else {
      this.logger.debug('Repo already exists');
    }
  }

  /**
   * Commit current changes (cardRoot + .cards).
   * @param message Commit message.
   * @param author Optional author; the committer is always the bot.
   * @param trailers Optional git trailers, appended as the last paragraph.
   */
  async commit(
    message: string = 'Autocommit',
    author?: { name: string; email: string },
    trailers: Record<string, string> = {},
  ): Promise<void> {
    // Stage only the directories we care about
    this.logger.debug('Staging changes');
    await this.git.add(['cardRoot', '.cards']);

    // Check if there's anything to commit. Not status().staged: it leaves
    // out renames, so a write that only moved files would go uncommitted.
    const staged = (await this.git.diff(['--cached', '--name-only']))
      .split('\n')
      .filter((line) => line !== '');
    if (staged.length === 0) {
      this.logger.debug('Nothing to commit, skipping');
      return;
    }

    this.logger.info(
      { message, stagedFiles: staged.length },
      'Committing changes',
    );
    const commitOpts: Record<string, string> = {};
    if (author) {
      commitOpts['--author'] = `${author.name} <${author.email}>`;
    }
    const trailerBlock = Object.entries(trailers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    // simple-git passes each array item as its own -m (i.e. paragraph)
    const fullMessage = trailerBlock ? [message, trailerBlock] : message;
    await this.git.commit(fullMessage, undefined, commitOpts);
  }

  /** Rollback: restore cardRoot and .cards to last committed state. */
  async rollback(): Promise<void> {
    this.logger.info('Rollback starting');
    // Restore modified tracked files (ignore errors if paths have no tracked content)
    try {
      await this.git.checkout(['--', 'cardRoot', '.cards']);
    } catch {
      this.logger.debug('No tracked files to restore');
    }
    // Remove new untracked files created during the failed write
    await this.git.clean('f', ['-d', 'cardRoot', '.cards']);
    this.logger.info('Rollback completed');
  }

  /** List all version tags (v*) sorted by version descending. */
  async listVersionTags(): Promise<string[]> {
    const result = await this.git.tags(['--list', 'v*', '--sort=-v:refname']);
    return result.all;
  }

  /**
   * Create an annotated tag from a clean version string.
   * @param version Clean semver string (e.g. "1.2.3")
   * @param message Optional tag message (defaults to the tag name)
   */
  async tagVersion(version: string, message?: string): Promise<void> {
    const tag = versionToTag(version);
    this.logger.info({ tag }, 'Creating tag');
    await this.git.tag(['-a', tag, '-m', message ?? tag]);
  }

  /** Delete a local version tag. */
  async deleteTag(version: string): Promise<void> {
    const tag = versionToTag(version);
    this.logger.info({ tag }, 'Deleting tag');
    await this.git.tag(['-d', tag]);
  }

  /** Check if the working tree has uncommitted changes in project directories (staged or unstaged). */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status(['--', 'cardRoot', '.cards']);
    return !status.isClean();
  }

  /** Check whether the project directory is a git repository. */
  async isRepo(): Promise<boolean> {
    try {
      return await this.git.checkIsRepo();
    } catch {
      return false;
    }
  }

  static readonly DEFAULT_REMOTE = 'origin';

  /** Get the URL of a named remote. Returns null if the remote does not exist or the directory is not a git repo. */
  async getRemoteUrl(
    remoteName: string = GitManager.DEFAULT_REMOTE,
  ): Promise<string | null> {
    try {
      const remotes = await this.git.getRemotes(true);
      const remote = remotes.find((r) => r.name === remoteName);
      return remote?.refs?.push ?? null;
    } catch {
      return null;
    }
  }

  /** Set (or add) the URL of a named remote. Throws if the directory is not a git repo. */
  async setRemoteUrl(
    url: string,
    remoteName: string = GitManager.DEFAULT_REMOTE,
  ): Promise<void> {
    if (!(await this.isRepo())) {
      throw new Error(
        'Cannot set remote URL: directory is not a git repository',
      );
    }
    const remotes = await this.git.getRemotes(true);
    const exists = remotes.some((r) => r.name === remoteName);
    if (exists) {
      await this.git.remote(['set-url', remoteName, url]);
    } else {
      await this.git.addRemote(remoteName, url);
    }
    this.logger.info({ remoteName, url }, 'Remote URL updated');
  }

  /**
   * Push current branch and optionally tags to remote.
   *
   * Failures are deliberately not interpreted here. A missing remote, an
   * unreachable host and a remote that has moved on independently all surface
   * as the git error, which says more than anything this could add, and says
   * it without matching on git's message text.
   *
   * @param options `remote` to push to, and whether to carry tags along.
   */
  async push(options: { tags?: boolean; remote: string }): Promise<void> {
    const { remote } = options;
    const branch = (await this.git.branch()).current;
    if (!branch) {
      // Otherwise the push runs as `git push -u <remote> ''`.
      throw new Error('Cannot push: no branch is checked out');
    }
    // Debug, not info: with autopush this runs once per card edit.
    this.logger.debug({ remote, branch }, 'Pushing to remote');
    // `--progress` because git suppresses transfer progress when stderr is not
    // a terminal, which it never is under the server. Without it a large push
    // is silent for its whole upload and the idle timeout cannot tell it apart
    // from a stalled connection.
    const args = ['-u', '--progress', remote, branch];
    if (options?.tags) {
      args.push('--follow-tags');
    }
    await this.git.push(args);
  }

  /** The commit HEAD points at. */
  async headCommit(): Promise<string> {
    return (await this.git.revparse(['HEAD'])).trim();
  }

  /**
   * Path of the project folder inside its repository: '' when the project is
   * the repository root. A worktree holds the project at the same path.
   */
  async pathInRepo(): Promise<string> {
    const prefix = (await this.git.revparse(['--show-prefix'])).trim();
    return prefix.replace(/\/$/, '');
  }

  /**
   * Check out a new branch into a new worktree.
   * @param path Folder for the worktree; must not exist or be empty.
   * @param branch Name of the branch to create.
   * @param startPoint Commit the branch starts from.
   */
  async addWorktree(
    path: string,
    branch: string,
    startPoint: string,
  ): Promise<void> {
    this.logger.info({ path, branch, startPoint }, 'Adding worktree');
    await this.git.raw(['worktree', 'add', '-b', branch, path, startPoint]);
  }

  /**
   * Remove a worktree and its folder. The branch is kept.
   * @param path Folder of the worktree.
   * @param force Also remove a worktree with uncommitted changes.
   */
  async removeWorktree(path: string, force = false): Promise<void> {
    this.logger.info({ path, force }, 'Removing worktree');
    await this.git.raw([
      'worktree',
      'remove',
      ...(force ? ['--force'] : []),
      path,
    ]);
  }

  /** Worktrees of the repository, the main one first. */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.git.raw([
      'worktree',
      'list',
      '--porcelain',
      '-z',
    ]);
    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};
    for (const field of output.split('\0')) {
      if (field === '') {
        if (current.path && current.head) {
          worktrees.push(current as WorktreeInfo);
        }
        current = {};
        continue;
      }
      const [key, ...rest] = field.split(' ');
      const value = rest.join(' ');
      if (key === 'worktree') current.path = value;
      else if (key === 'HEAD') current.head = value;
      else if (key === 'branch')
        current.branch = value.replace(/^refs\/heads\//, '');
    }
    return worktrees;
  }

  /** Forget worktrees whose folders are gone. */
  async pruneWorktrees(): Promise<void> {
    await this.git.raw(['worktree', 'prune']);
  }

  /**
   * Delete a local branch.
   * @param branch Branch to delete.
   * @param force Also delete a branch that is not merged.
   */
  async deleteBranch(branch: string, force = false): Promise<void> {
    this.logger.info({ branch, force }, 'Deleting branch');
    await this.git.raw(['branch', force ? '-D' : '-d', branch]);
  }

  /** Best common ancestor of two commits. */
  async mergeBase(a: string, b: string): Promise<string> {
    return (await this.git.raw(['merge-base', a, b])).trim();
  }

  /**
   * Project content files that differ between two commits, with renames
   * detected. Paths are relative to the project folder.
   */
  async changedFiles(from: string, to: string): Promise<ChangedFile[]> {
    const output = await this.git.raw([
      'diff',
      '--name-status',
      '-M',
      '-z',
      '--relative',
      from,
      to,
      '--',
      ...CONTENT_PATHS,
    ]);
    const fields = output.split('\0').filter((field) => field !== '');
    const files: ChangedFile[] = [];
    for (let i = 0; i < fields.length;) {
      // Rename status carries a similarity score, e.g. 'R087'
      const status = fields[i++].charAt(0) as ChangedFile['status'];
      if (status === 'R') {
        const from = fields[i++];
        files.push({ status, from, path: fields[i++] });
      } else {
        files.push({ status, path: fields[i++] });
      }
    }
    return files;
  }

  /**
   * Content of a project file at a commit.
   * @param ref Commit to read from.
   * @param path Path relative to the project folder.
   * @returns the content, or null if the file does not exist at that commit.
   */
  async showFile(ref: string, path: string): Promise<string | null> {
    try {
      // './' resolves the path against the project folder, not the repo root
      return await this.git.show([`${ref}:./${path}`]);
    } catch {
      return null;
    }
  }

  /**
   * Commits reachable from 'to' but not from 'from' that touch project
   * content, newest first.
   */
  async log(from: string, to: string): Promise<CommitInfo[]> {
    const fieldSep = '\x1f';
    const recordSep = '\x1e';
    const output = await this.git.raw([
      'log',
      `--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%(trailers:only,unfold)%x1e`,
      `${from}..${to}`,
      '--',
      ...CONTENT_PATHS,
    ]);
    return output
      .split(recordSep)
      .map((record) => record.trim())
      .filter((record) => record !== '')
      .map((record) => {
        const [hash, name, email, date, subject, trailerBlock] =
          record.split(fieldSep);
        const trailers: Record<string, string> = {};
        for (const line of (trailerBlock ?? '').split('\n')) {
          const separator = line.indexOf(': ');
          if (separator > 0) {
            trailers[line.slice(0, separator)] = line.slice(separator + 2);
          }
        }
        return { hash, author: { name, email }, date, subject, trailers };
      });
  }

  /**
   * List available version tags from a remote repository.
   * Does not require a local repo — queries the remote directly.
   * @param remoteUrl Git remote URL to query
   * @returns Semver version strings sorted descending (e.g. ["2.1.0", "1.0.0"])
   */
  static async listRemoteVersionTags(remoteUrl: string): Promise<string[]> {
    const git = createGit({ timeout: gitTimeout() });
    const output = await git.listRemote(['--tags', '--refs', remoteUrl]);
    if (!output.trim()) {
      return [];
    }
    const versions: string[] = [];
    for (const line of output.trim().split('\n')) {
      const match = line.match(/refs\/tags\/(.+)$/);
      if (!match) continue;
      const version = stripTagPrefix(match[1]);
      if (semver.valid(version)) {
        versions.push(version);
      }
    }
    return versions.sort(semver.rcompare);
  }
}
