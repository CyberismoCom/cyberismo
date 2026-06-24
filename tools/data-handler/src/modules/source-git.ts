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

import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

import { simpleGit, type SimpleGit } from 'simple-git';

import { NON_INTERACTIVE_GIT_ENV, gitTimeout } from '../utils/git-config.js';
import { GitManager } from '../utils/git-manager.js';
import { parseSealFileName, type SealFile } from '../mutations/replay/seal-files.js';
import { pickVersion, versionToTag } from './version.js';
import type { FetchTarget, SourceLayer } from './source.js';
import type { RemoteQueryOutcome, Source, Version, VersionRange } from './types.js';
import type { ProjectSettings } from '../interfaces/project-interfaces.js';

function cloneOptions(ref?: string): string[] {
  const options = ['--depth', '1'];
  if (ref) {
    options.push('--branch', ref);
  }
  return options;
}

/**
 * Source layer for git remotes (HTTPS and SSH). Shallow-clones the
 * target (`--depth 1`, optional `--branch <ref>`) and queries version
 * tags via `GitManager.listRemoteVersionTags`.
 */
export class GitSourceLayer implements SourceLayer {
  async fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string> {
    const destinationPath = join(destRoot, nameHint);

    await mkdir(destRoot, { recursive: true });
    await rm(destinationPath, { recursive: true, force: true });

    const git: SimpleGit = simpleGit({
      timeout: { block: gitTimeout() },
    });

    try {
      await git
        .env({ ...NON_INTERACTIVE_GIT_ENV })
        .clone(target.remoteUrl, destinationPath, cloneOptions(target.ref));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(
          `Failed to clone module '${nameHint}': ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }

    return destinationPath;
  }

  supportsVersioning(): boolean {
    return true;
  }

  async listRemoteVersions(
    location: string,
    remoteUrl?: string,
  ): Promise<string[]> {
    return GitManager.listRemoteVersionTags(remoteUrl ?? location);
  }

  async queryRemote(
    source: Source,
    options?: { remoteUrl?: string; range?: VersionRange | string },
  ): Promise<RemoteQueryOutcome> {
    let available: string[];
    try {
      available = await this.listRemoteVersions(
        source.location,
        options?.remoteUrl,
      );
    } catch {
      // Any failure reaching the remote becomes an unreachable outcome.
      return { reachable: false };
    }

    const latest = pickVersion(available);
    const latestSatisfying =
      options?.range !== undefined
        ? pickVersion(available, options.range)
        : undefined;

    return {
      reachable: true,
      latest,
      latestSatisfying,
    };
  }

  // Per-repo blobless clones reused across readMetadata calls.
  private repos = new Map<string, Promise<string>>();

  private ensureRepo(url: string): Promise<string> {
    let p = this.repos.get(url);
    if (!p) {
      p = (async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cyb-meta-'));
        const git = simpleGit({ timeout: { block: gitTimeout() } }).env({ ...NON_INTERACTIVE_GIT_ENV });
        // All refs, no checkout, blobs lazy. Fall back to a full clone if the
        // server rejects partial clone.
        try { await git.clone(url, dir, ['--no-checkout', '--filter=blob:none']); }
        catch { await git.clone(url, dir, ['--no-checkout']); }
        return dir;
      })();
      this.repos.set(url, p);
    }
    return p;
  }

  async readMetadata(source: Source, version: Version, remoteUrl?: string): Promise<{ config: ProjectSettings; seals: SealFile[] }> {
    const tag = versionToTag(version);
    const g = simpleGit(await this.ensureRepo(remoteUrl ?? source.location));
    const config = JSON.parse(
      await g.raw(['cat-file', '-p', `${tag}:.cards/local/cardsConfig.json`]),
    ) as ProjectSettings;
    let seals: SealFile[] = [];
    try {
      const listing = await g.raw(['ls-tree', '--name-only', tag, '.cards/local/migrations/']);
      seals = listing.split('\n').map((s) => s.trim()).filter(Boolean)
        .map((s) => parseSealFileName(basename(s)))
        .filter((s): s is SealFile => s !== undefined);
    } catch { seals = []; }
    return { config, seals };
  }

  /** Remove cached clones; called once a solve finishes. */
  async dispose(): Promise<void> {
    const paths = [...this.repos.values()];
    this.repos.clear();
    for (const p of paths) {
      try { await rm(await p, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}
