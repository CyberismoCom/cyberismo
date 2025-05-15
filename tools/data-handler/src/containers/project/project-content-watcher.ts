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

import { watch } from 'node:fs';

import { getChildLogger } from '../../utils/log-utils.js';

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
