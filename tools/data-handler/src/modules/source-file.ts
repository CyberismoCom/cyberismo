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

import { resolve as pathResolve } from 'node:path';

import { isFileLocation, stripFileProtocol } from './location.js';
import type { FetchTarget, SourceLayer } from './source.js';
import type { RemoteQueryOutcome } from './types.js';

/**
 * Source layer for `file:` URLs and bare filesystem paths.
 *
 * File sources do not support versioning: `listRemoteVersions` returns
 * `[]` and `queryRemote` always reports `reachable: true` with no
 * version information. `fetch` resolves the local path without touching
 * the filesystem — the module is read in place.
 */
export class FileSourceLayer implements SourceLayer {
  async fetch(target: FetchTarget): Promise<string> {
    if (isFileLocation(target.location)) {
      return pathResolve(stripFileProtocol(target.location));
    }
    // Bare path — resolve relative to the current working directory.
    return pathResolve(target.location);
  }

  async listRemoteVersions(): Promise<string[]> {
    return [];
  }

  async queryRemote(): Promise<RemoteQueryOutcome> {
    return {
      reachable: true,
      latest: undefined,
      latestSatisfying: undefined,
    };
  }
}
