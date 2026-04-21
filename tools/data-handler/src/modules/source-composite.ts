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

import type { FetchTarget, SourceLayer } from './source.js';
import type { RemoteQueryOutcome, Source, VersionRange } from './types.js';

/** One dispatch route: a predicate plus the layer to delegate to. */
export interface SourceRoute {
  /** True when this route should handle the given location string. */
  accepts: (location: string) => boolean;
  /** Layer to delegate calls to when `accepts` matches. */
  layer: SourceLayer;
}

/**
 * Dispatches `SourceLayer` calls to the first route whose `accepts`
 * predicate matches the location. The list is order-sensitive: callers
 * should end the route list with a catch-all (`() => true`) to ensure
 * every location resolves to some layer.
 */
export class CompositeSourceLayer implements SourceLayer {
  constructor(private readonly routes: readonly SourceRoute[]) {}

  private pick(location: string): SourceLayer {
    for (const route of this.routes) {
      if (route.accepts(location)) {
        return route.layer;
      }
    }
    throw new Error(
      `No source layer accepts location '${location}'. ` +
        `The composite must include a catch-all route.`,
    );
  }

  async fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string> {
    return this.pick(target.location).fetch(target, destRoot, nameHint);
  }

  async listRemoteVersions(
    location: string,
    remoteUrl?: string,
  ): Promise<string[]> {
    return this.pick(location).listRemoteVersions(location, remoteUrl);
  }

  async queryRemote(
    source: Source,
    options?: { remoteUrl?: string; range?: VersionRange | string },
  ): Promise<RemoteQueryOutcome> {
    return this.pick(source.location).queryRemote(source, options);
  }
}
