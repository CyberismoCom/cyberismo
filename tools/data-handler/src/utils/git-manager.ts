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

import { simpleGit, type SimpleGit } from 'simple-git';
import { getChildLogger } from './log-utils.js';

const TAG_PREFIX = 'v';

export class GitManager {
  private git: SimpleGit;
  private logger = getChildLogger({ module: 'GitManager' });

  constructor(projectPath: string) {
    this.git = simpleGit(projectPath, {
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

  /** Commit current changes (cardRoot + .cards). */
  async commit(
    message: string = 'Autocommit',
    author?: { name: string; email: string },
  ): Promise<void> {
    // Stage only the directories we care about
    this.logger.debug('Staging changes');
    await this.git.add(['cardRoot', '.cards']);

    // Check if there's anything to commit
    const status = await this.git.status();
    if (status.staged.length === 0) {
      this.logger.debug('Nothing to commit, skipping');
      return;
    }

    this.logger.info(
      { message, stagedFiles: status.staged.length },
      'Committing changes',
    );
    const commitOpts: Record<string, string> = {};
    if (author) {
      commitOpts['--author'] = `${author.name} <${author.email}>`;
    }
    await this.git.commit(message, undefined, commitOpts);
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
    const result = await this.git.tags([
      '--list',
      'v*',
      '--sort=-v:refname',
    ]);
    return result.all;
  }

  /**
   * Create an annotated tag from a clean version string.
   * @param version Clean semver string (e.g. "1.2.3")
   * @param message Optional tag message (defaults to the tag name)
   */
  async tagVersion(version: string, message?: string): Promise<void> {
    const tag = `${TAG_PREFIX}${version}`;
    this.logger.info({ tag }, 'Creating tag');
    await this.git.tag(['-a', tag, '-m', message ?? tag]);
  }

  /** Check if the working tree has uncommitted changes in project directories (staged or unstaged). */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status(['--', 'cardRoot', '.cards']);
    return !status.isClean();
  }

  /** Push current branch and optionally tags to remote. */
  async push(options?: { tags?: boolean; remote?: string }): Promise<void> {
    const remote = options?.remote ?? 'origin';
    this.logger.info({ remote }, 'Pushing to remote');
    const branch = (await this.git.branch()).current;
    const args = ['-u', remote, branch];
    if (options?.tags) {
      args.push('--follow-tags');
    }
    await this.git.push(args);
  }
}
