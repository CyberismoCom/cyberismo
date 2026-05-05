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

import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { simpleGit, type SimpleGit } from 'simple-git';

import { NON_INTERACTIVE_GIT_ENV, gitTimeout } from '../utils/git-config.js';
import { GitManager } from '../utils/git-manager.js';
import { pickVersion } from './version.js';
import type { FetchTarget, SourceLayer } from './source.js';
import type { RemoteQueryOutcome, Source, VersionRange } from './types.js';

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
}
