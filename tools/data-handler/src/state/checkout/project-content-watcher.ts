// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { watch } from 'node:fs';

import { getChildLogger } from '../../shared/utils/log-utils.js';

/**
 * Class that starts watching certain path for changes.
 * Generally we are not interested for file renames, as they are handled
 * through rename command, thus there is an option to ignore those.
 */
export class ContentWatcher {
  private watcher;
  private abortController = new AbortController();

  constructor(
    ignoreRenames: boolean,
    private watchPath: string,
    callback: (fileName: string) => void,
  ) {
    this.watcher = watch(
      this.watchPath,
      {
        persistent: true,
        recursive: true,
        signal: this.abortController.signal,
      },
      (eventType, filename) => {
        if ((ignoreRenames && eventType === 'rename') || !filename) {
          return;
        }
        callback(filename);
      },
    ).on('error', (error) => {
      ContentWatcher.logger.error(error, 'Watch error');
      this.close();
    });
    this.watcher.unref();
  }

  // Returns instance of logger.
  private static get logger() {
    return getChildLogger({
      module: 'contentWatcher',
    });
  }

  /**
   * Close content watcher. Removes watcher.
   */
  public close() {
    this.abortController.abort();
  }
}
