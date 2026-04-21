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

import { isGitLocation } from './location.js';
import { CompositeSourceLayer } from './source-composite.js';
import { FileSourceLayer } from './source-file.js';
import { GitSourceLayer } from './source-git.js';
import {
  type RemoteQueryOutcome,
  type Source,
  type VersionRange,
} from './types.js';

/** A concrete fetch target. `remoteUrl` is pre-built with any credentials injected. */
export interface FetchTarget {
  location: string;
  remoteUrl: string;
  /** Optional git ref (tag or branch). Default branch when omitted. */
  ref?: string;
}

/** File-I/O and network layer for fetching modules. Never persists state. */
export interface SourceLayer {
  /**
   * Fetch a module into `destRoot/<nameHint>` and return the absolute path.
   * Git sources are shallow-cloned (`--depth 1`); file sources resolve
   * without any filesystem mutation.
   */
  fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string>;

  /** Remote version tags in descending semver order; `[]` for file sources. */
  listRemoteVersions(location: string, remoteUrl?: string): Promise<string[]>;

  /**
   * Query a remote for available versions. Always resolves: transient
   * failures yield `{ reachable: false }` rather than throwing.
   */
  queryRemote(
    source: Source,
    options?: { remoteUrl?: string; range?: VersionRange | string },
  ): Promise<RemoteQueryOutcome>;
}

/**
 * Build the default source layer: a composite that routes git URLs to
 * {@link GitSourceLayer} and everything else (file: URLs and bare paths)
 * to {@link FileSourceLayer}.
 */
export function createSourceLayer(): SourceLayer {
  return new CompositeSourceLayer([
    { accepts: isGitLocation, layer: new GitSourceLayer() },
    // Catch-all: file: URLs and bare paths both behave as file sources.
    { accepts: () => true, layer: new FileSourceLayer() },
  ]);
}
