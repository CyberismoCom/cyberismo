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
import { parseTag } from './semver.js';

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

  /** Create an annotated git tag. */
  async tag(tagName: string, message?: string): Promise<void> {
    this.logger.info({ tagName }, 'Creating tag');
    await this.git.tag(['-a', tagName, '-m', message || tagName]);
  }

  /** List all version tags (v*) sorted by version descending. */
  async listVersionTags(): Promise<string[]> {
    const result = await this.git.tags(['--list', 'v*', '--sort=-v:refname']);
    return result.all;
  }

  /**
   * Get the current project version from the latest git tag.
   * @returns semver string (e.g. "1.2.3") or null if no version tags exist.
   */
  async getVersion(): Promise<string | null> {
    const tags = await this.listVersionTags();
    // Tags are already sorted descending by git (--sort=-v:refname)
    const versions = tags
      .map((tag) => parseTag(tag))
      .filter((v): v is string => v !== null);
    if (versions.length === 0) return null;
    return versions[0];
  }

  /**
   * Check if there are changes since a given tag.
   * @returns true if HEAD differs from the tagged commit.
   */
  async hasChangesSinceTag(tag: string): Promise<boolean> {
    const diff = await this.git.diff(['--stat', `${tag}..HEAD`]);
    return diff.trim().length > 0;
  }

  /** Check if the working tree has uncommitted changes in project directories (staged or unstaged). */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status(['--', 'cardRoot', '.cards']);
    return !status.isClean();
  }

  /** Push current branch and optionally tags to remote. */
  async push(options?: { tags?: boolean }): Promise<void> {
    this.logger.info('Pushing to remote');
    if (options?.tags) {
      await this.git.push(['--follow-tags']);
    } else {
      await this.git.push();
    }
  }
}
