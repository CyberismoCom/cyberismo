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
import { resolve as pathResolve, join } from 'node:path';

import { simpleGit, type SimpleGit } from 'simple-git';

import { GitManager } from '../utils/git-manager.js';
import {
  isFileLocation,
  isGitLocation,
  stripFileProtocol,
} from './location.js';
import { pickVersion } from './version.js';
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

// Git environment settings that keep clone/ls-remote non-interactive.
// `GIT_TERMINAL_PROMPT=0` suppresses the credential prompt and
// `GCM_INTERACTIVE=never` opts out of Git Credential Manager popups.
const NON_INTERACTIVE_GIT_ENV = {
  GIT_TERMINAL_PROMPT: 0,
  GCM_INTERACTIVE: 'never',
} as const;

/** 15s base, doubled in CI, plus a 50% bump on Windows. */
function gitTimeout(): number {
  const baseTimeout = 15000;
  const isCI = process.env.CI;
  const isWindows = process.platform === 'win32';

  let timeout = baseTimeout;
  if (isCI) timeout *= 2;
  if (isWindows) timeout *= 1.5;

  return timeout;
}

function cloneOptions(ref?: string): string[] {
  const options = ['--depth', '1'];
  if (ref) {
    options.push('--branch', ref);
  }
  return options;
}

class DefaultSourceLayer implements SourceLayer {
  async fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string> {
    if (isFileLocation(target.location)) {
      return pathResolve(stripFileProtocol(target.location));
    }

    if (!isGitLocation(target.location)) {
      // Treat a bare path as a file source.
      return pathResolve(target.location);
    }

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

  async listRemoteVersions(
    location: string,
    remoteUrl?: string,
  ): Promise<string[]> {
    if (isFileLocation(location) || !isGitLocation(location)) {
      return [];
    }
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

export function createSourceLayer(): SourceLayer {
  return new DefaultSourceLayer();
}
