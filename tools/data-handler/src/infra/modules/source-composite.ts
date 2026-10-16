// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { FetchTarget, SourceLayer } from './source.js';
import type { Source } from '@cyberismo/model';
import type { Version } from '../../shared/utils/version.js';
import type { SealFile } from '../replay-log/seal-files.js';
import type { ProjectSettings } from '@cyberismo/model';

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

  supportsVersioning(location: string): boolean {
    return this.pick(location).supportsVersioning(location);
  }

  async listRemoteVersions(
    location: string,
    remoteUrl?: string,
  ): Promise<string[]> {
    return this.pick(location).listRemoteVersions(location, remoteUrl);
  }

  async readMetadata(
    source: Source,
    version: Version | null,
    remoteUrl?: string,
  ): Promise<{ config: ProjectSettings; seals: SealFile[] }> {
    return this.pick(source.location).readMetadata(source, version, remoteUrl);
  }

  async dispose(): Promise<void> {
    for (const { layer } of this.routes) {
      await layer.dispose?.();
    }
  }
}
