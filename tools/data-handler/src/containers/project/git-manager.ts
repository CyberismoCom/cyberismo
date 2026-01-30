/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2025
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation. This program is distributed in the hope that it
  will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty
  of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
  See the GNU Affero General Public License for more details.
  You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { simpleGit, type SimpleGit, type StatusResult } from 'simple-git';

import { pathExists } from '../../utils/file-utils.js';

/**
 * Git user configuration.
 */
export interface GitUserConfig {
  name: string;
  email: string;
}

/**
 * Git status information.
 */
export interface GitStatus {
  isRepo: boolean;
  branch: string;
  isClean: boolean;
  modified: string[];
  staged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
}

/**
 * Git worktree information.
 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
}

/**
 * Result of a merge operation.
 */
export interface MergeResult {
  success: boolean;
  commitHash?: string;
  conflicts?: string[];
  message?: string;
}

/**
 * Manages Git operations for a Cyberismo project.
 */
export class GitManager {
  private git: SimpleGit;
  private resolvedProjectPath: string;
  private static readonly WORKTREES_FOLDER = '.worktrees';

  constructor(private projectPath: string) {
    // Resolve symlinks for consistent path comparison (e.g., /tmp -> /private/tmp on macOS)
    try {
      this.resolvedProjectPath = realpathSync(projectPath);
    } catch {
      // If path doesn't exist yet, use the original path
      this.resolvedProjectPath = projectPath;
    }

    this.git = simpleGit({
      baseDir: projectPath,
      timeout: {
        block: this.gitTimeout(),
      },
    });
  }

  /**
   * Calculate timeout for Git operations.
   * Increases timeout in CI environments and on Windows.
   */
  private gitTimeout(): number {
    const baseTimeout = 15000;
    const isCI = process.env.CI;
    const isWindows = process.platform === 'win32';

    let timeout = baseTimeout;
    if (isCI) timeout *= 2;
    if (isWindows) timeout *= 1.5;

    return timeout;
  }

  /**
   * Initialize a new Git repository.
   * @param initialBranch Optional name for the initial branch (defaults to 'main')
   */
  public async init(initialBranch: string = 'main'): Promise<void> {
    await this.git.init(['--initial-branch', initialBranch]);
  }

  /**
   * Check if the project path is a Git repository.
   */
  public async isGitRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current Git status.
   */
  public async getStatus(): Promise<GitStatus> {
    const isRepo = await this.isGitRepo();
    if (!isRepo) {
      return {
        isRepo: false,
        branch: '',
        isClean: true,
        modified: [],
        staged: [],
        untracked: [],
        ahead: 0,
        behind: 0,
      };
    }

    const status: StatusResult = await this.git.status();

    return {
      isRepo: true,
      branch: status.current || '',
      isClean: status.isClean(),
      modified: status.modified,
      staged: status.staged,
      untracked: status.not_added,
      ahead: status.ahead,
      behind: status.behind,
    };
  }

  /**
   * Get the current branch name.
   */
  public async getCurrentBranch(): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return branch.trim();
    } catch {
      return '';
    }
  }

  /**
   * Get Git user configuration from the repository.
   */
  public async getUserConfig(): Promise<GitUserConfig> {
    try {
      const name = await this.git.getConfig('user.name', 'local');
      const email = await this.git.getConfig('user.email', 'local');

      // Fall back to global config if local is not set
      const globalName =
        name.value || (await this.git.getConfig('user.name', 'global')).value;
      const globalEmail =
        email.value || (await this.git.getConfig('user.email', 'global')).value;

      return {
        name: globalName || 'Unknown',
        email: globalEmail || 'unknown@example.com',
      };
    } catch {
      return {
        name: 'Unknown',
        email: 'unknown@example.com',
      };
    }
  }

  /**
   * Add files to the staging area.
   * @param files Array of file paths to add (relative to project root)
   */
  public async add(files: string[]): Promise<void> {
    if (files.length === 0) return;
    await this.git.add(files);
  }

  /**
   * Add all changes to the staging area.
   */
  public async addAll(): Promise<void> {
    await this.git.add(['-A']);
  }

  /**
   * Commit staged changes.
   * @param message Commit message
   * @returns Commit hash
   */
  public async commit(message: string): Promise<string> {
    const result = await this.git.commit(message);
    return result.commit;
  }

  /**
   * Create a new branch.
   * @param name Branch name
   * @param startPoint Optional starting point (commit, branch, or tag)
   */
  public async createBranch(name: string, startPoint?: string): Promise<void> {
    if (startPoint) {
      await this.git.branch([name, startPoint]);
    } else {
      await this.git.branch([name]);
    }
  }

  /**
   * Delete a branch.
   * @param name Branch name
   * @param force Force deletion even if not fully merged
   */
  public async deleteBranch(name: string, force: boolean = false): Promise<void> {
    const flag = force ? '-D' : '-d';
    await this.git.branch([flag, name]);
  }

  /**
   * List all local branches.
   */
  public async listBranches(): Promise<string[]> {
    const result = await this.git.branchLocal();
    return result.all;
  }

  /**
   * Check if a branch exists.
   * @param name Branch name
   */
  public async branchExists(name: string): Promise<boolean> {
    const branches = await this.listBranches();
    return branches.includes(name);
  }

  /**
   * Checkout a branch.
   * @param name Branch name
   */
  public async checkout(name: string): Promise<void> {
    await this.git.checkout(name);
  }

  /**
   * Get the path to the worktrees folder.
   */
  public get worktreesFolder(): string {
    return join(this.projectPath, GitManager.WORKTREES_FOLDER);
  }

  /**
   * Create a Git worktree for isolated editing.
   * @param worktreePath Path where the worktree will be created
   * @param branch Branch name for the worktree
   * @param createBranch If true, create a new branch; if false, use existing branch
   */
  public async createWorktree(
    worktreePath: string,
    branch: string,
    createBranch: boolean = true,
  ): Promise<void> {
    if (createBranch) {
      await this.git.raw(['worktree', 'add', '-b', branch, worktreePath]);
    } else {
      await this.git.raw(['worktree', 'add', worktreePath, branch]);
    }
  }

  /**
   * Remove a Git worktree.
   * @param worktreePath Path to the worktree
   * @param force Force removal even if worktree has uncommitted changes
   */
  public async removeWorktree(
    worktreePath: string,
    force: boolean = false,
  ): Promise<void> {
    const args = ['worktree', 'remove'];
    if (force) {
      args.push('--force');
    }
    args.push(worktreePath);

    await this.git.raw(args);
  }

  /**
   * List all worktrees.
   */
  public async listWorktrees(): Promise<WorktreeInfo[]> {
    const result = await this.git.raw(['worktree', 'list', '--porcelain']);
    const worktrees: WorktreeInfo[] = [];

    const blocks = result.split('\n\n').filter((block) => block.trim());

    for (const block of blocks) {
      const lines = block.split('\n');
      let path = '';
      let branch = '';

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          path = line.substring('worktree '.length);
        } else if (line.startsWith('branch ')) {
          branch = line.substring('branch refs/heads/'.length);
        } else if (line === 'detached') {
          branch = 'HEAD (detached)';
        }
      }

      if (path) {
        worktrees.push({
          path,
          branch,
          isMain: path === this.resolvedProjectPath,
        });
      }
    }

    return worktrees;
  }

  /**
   * Prune worktree information for worktrees that no longer exist on disk.
   */
  public async pruneWorktrees(): Promise<void> {
    await this.git.raw(['worktree', 'prune']);
  }

  /**
   * Merge a branch into the current branch.
   * @param branch Branch to merge
   * @param strategy Merge strategy ('ours' keeps current, 'theirs' keeps incoming)
   */
  public async merge(
    branch: string,
    strategy?: 'ours' | 'theirs',
  ): Promise<MergeResult> {
    try {
      let args = ['merge', branch];

      if (strategy) {
        args = ['merge', '-X', strategy, branch];
      }

      const result = await this.git.raw(args);

      // Get the new HEAD commit hash
      const commitHash = await this.git.revparse(['HEAD']);

      return {
        success: true,
        commitHash: commitHash.trim(),
        message: result,
      };
    } catch (error) {
      // Check if there are conflicts
      const status = await this.git.status();
      const conflicts = status.conflicted;

      if (conflicts.length > 0) {
        return {
          success: false,
          conflicts,
          message: `Merge conflict in files: ${conflicts.join(', ')}`,
        };
      }

      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown merge error',
      };
    }
  }

  /**
   * Abort an in-progress merge.
   */
  public async abortMerge(): Promise<void> {
    await this.git.raw(['merge', '--abort']);
  }

  /**
   * Get the commit hash of HEAD.
   */
  public async getHeadCommit(): Promise<string> {
    try {
      const hash = await this.git.revparse(['HEAD']);
      return hash.trim();
    } catch {
      return '';
    }
  }

  /**
   * Check if there are any commits in the repository.
   */
  public async hasCommits(): Promise<boolean> {
    try {
      await this.git.revparse(['HEAD']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if worktrees folder exists.
   */
  public worktreesFolderExists(): boolean {
    return pathExists(this.worktreesFolder);
  }

  /**
   * Generate a unique worktree path for a card edit session.
   * @param cardKey The card being edited
   * @returns Path for the worktree
   */
  public generateWorktreePath(cardKey: string): string {
    const timestamp = Date.now();
    const safeName = `edit-${cardKey}-${timestamp}`;
    return join(this.worktreesFolder, safeName);
  }

  /**
   * Generate a branch name for a card edit session.
   * @param cardKey The card being edited
   * @returns Branch name
   */
  public generateBranchName(cardKey: string): string {
    const timestamp = Date.now();
    return `edit/${cardKey}/${timestamp}`;
  }
}
