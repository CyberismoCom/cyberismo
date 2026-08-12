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
import {
  clone as cloneFromGitService,
  isGitServiceEnabled,
  resolveGitServiceClonePath,
} from '../utils/git-service-client.js';
import { GitManager } from '../utils/git-manager.js';
import {
  parseSealFileName,
  type SealFile,
} from '../mutations/replay/seal-files.js';
import { versionToTag } from './version.js';
import type { FetchTarget, SourceLayer } from './source.js';
import type { Source, Version } from './types.js';
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

    if (isGitServiceEnabled()) {
      try {
        const clonePath = await cloneFromGitService({
          url: target.remoteUrl,
          ref: target.ref,
          shallow: true,
        });

        return resolveGitServiceClonePath(clonePath);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            `Failed to clone module '${nameHint}': ${error.message}`,
            { cause: error },
          );
        }
        throw error;
      }
    }

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

  // Per-repo blobless clones reused across readMetadata calls.
  private repos = new Map<string, Promise<string>>();

  private ensureRepo(url: string): Promise<string> {
    let p = this.repos.get(url);
    if (!p) {
      p = (async () => {
        const dir = await mkdtemp(join(tmpdir(), 'cyb-meta-'));
        try {
          const git = simpleGit({ timeout: { block: gitTimeout() } }).env({
            ...NON_INTERACTIVE_GIT_ENV,
          });
          // All refs, no checkout, blobs lazy. Fall back to a full clone if the
          // server rejects partial clone.
          try {
            await git.clone(url, dir, ['--no-checkout', '--filter=blob:none']);
          } catch {
            await git.clone(url, dir, ['--no-checkout']);
          }
          return dir;
        } catch (e) {
          this.repos.delete(url); // don't cache the failure
          await rm(dir, { recursive: true, force: true }).catch(() => {});
          throw e;
        }
      })();
      this.repos.set(url, p);
    }
    return p;
  }

  async readMetadata(
    source: Source,
    version: Version | null,
    remoteUrl?: string,
  ): Promise<{ config: ProjectSettings; seals: SealFile[] }> {
    const ref = version === null ? 'HEAD' : versionToTag(version);
    const g = simpleGit(
      await this.ensureRepo(remoteUrl ?? source.location),
    ).env({ ...NON_INTERACTIVE_GIT_ENV });
    const config = JSON.parse(
      await g.raw(['cat-file', '-p', `${ref}:.cards/local/cardsConfig.json`]),
    ) as ProjectSettings;
    let seals: SealFile[];
    try {
      const listing = await g.raw([
        'ls-tree',
        '--name-only',
        ref,
        '.cards/local/migrations/',
      ]);
      seals = listing
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseSealFileName(basename(s)))
        .filter((s): s is SealFile => s !== undefined);
    } catch {
      seals = [];
    }
    return { config, seals };
  }

  /** Remove cached clones; called once a solve finishes. */
  async dispose(): Promise<void> {
    const paths = [...this.repos.values()];
    this.repos.clear();
    for (const p of paths) {
      try {
        await rm(await p, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  }
}
