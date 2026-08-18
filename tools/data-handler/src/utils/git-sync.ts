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

import { sleep } from './common-utils.js';
import { getChildLogger } from './log-utils.js';
import { GitManager } from './git-manager.js';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 5000;

/**
 * Pushes autocommitted changes to the project's remote. One per project, so no
 * state is keyed.
 *
 * Scheduling, plus the one precondition that is a normal state rather than a
 * failure: no remote. Everything else is left to git, and a push that keeps
 * failing is retried a bounded number of times and then logged.
 *
 * Push only. Pulling is not the mirror image: a divergent remote is left for a
 * person to resolve rather than merged, since a merge could land under someone
 * mid-edit.
 */
export class GitSync {
  private running = false;
  private requestedAgain = false;
  private readonly logger = getChildLogger({ module: 'GitSync' });

  constructor(
    private readonly git: GitManager,
    private readonly options: { retryDelayMs?: number } = {},
  ) {}

  async push(): Promise<void> {
    if (this.running) {
      this.requestedAgain = true;
      return;
    }
    this.running = true;
    try {
      do {
        this.requestedAgain = false;
        await this.pushWithRetries();
      } while (this.requestedAgain);
    } finally {
      this.running = false;
    }
  }

  private async pushWithRetries(): Promise<void> {
    if (!(await this.git.getRemoteUrl(GitManager.DEFAULT_REMOTE))) {
      this.logger.debug('No remote configured; not pushing');
      return;
    }

    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.git.push({ remote: GitManager.DEFAULT_REMOTE });
        return;
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        if (attempt >= MAX_RETRIES) {
          this.logger.error({ err }, 'Push failed');
          return;
        }
        this.logger.debug(
          { attempt: attempt + 1, err },
          'Push failed; retrying',
        );
        // Unref'd: a pending backoff must not hold the CLI open, since the
        // caller fires this off with `void` and never awaits it.
        await sleep(
          (this.options.retryDelayMs ?? RETRY_DELAY_MS) * (attempt + 1),
          {
            unref: true,
          },
        );
      }
    }
  }
}
