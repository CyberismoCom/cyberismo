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
import { pickVersion } from './version.js';
import {
  type RemoteQueryOutcome,
  type Source,
  type VersionRange,
} from './types.js';

/**
 * A concrete fetch target handed to {@link SourceLayer.fetch}. The
 * `remoteUrl` has already been built by the caller (typically the
 * resolver) with any required credentials injected — the source layer
 * itself is credential-agnostic.
 */
export interface FetchTarget {
  /**
   * The module's declared location (a `file:` URL, an `https://` URL
   * or a `git@…` SSH URL). Used to decide between the git and file
   * code paths; not passed to git.
   */
  location: string;
  /**
   * Pre-built remote URL passed to `git clone`. For git sources the
   * caller may inject HTTPS credentials; for file sources this is
   * ignored.
   */
  remoteUrl: string;
  /**
   * Optional git ref (tag or branch) to shallow-clone. When omitted,
   * the repository's default branch is cloned.
   */
  ref?: string;
}

/**
 * File-I/O and network layer for fetching modules. Mirrors the spec's
 * deferred specifications for `query_remote` and the fetch behaviour
 * implicit in `ReplaceInstallation`. The source layer never touches
 * version-range semantics beyond what is needed to compute
 * `latestSatisfying` in {@link queryRemote}; it never persists state.
 */
export interface SourceLayer {
  /**
   * Fetch a module into `destRoot/<nameHint>` and return the absolute
   * path to the fetched copy.
   *
   * For git sources (`https://`, `git@`) this is a shallow clone
   * (`--depth 1`, with `--branch ref` when `ref` is provided). Any
   * pre-existing directory at the target path is removed first.
   *
   * For file sources (`file:<path>` or a plain path) this resolves the
   * local path and performs no filesystem mutation.
   */
  fetch(
    target: FetchTarget,
    destRoot: string,
    nameHint: string,
  ): Promise<string>;

  /**
   * List remote version tags for a git source, in descending semver
   * order. Returns an empty array for file sources.
   *
   * @param location Raw source location (used to detect file sources).
   * @param remoteUrl Optional credential-injected URL; falls back to
   *        `location` when absent.
   */
  listRemoteVersions(location: string, remoteUrl?: string): Promise<string[]>;

  /**
   * Implements the spec's deferred `query_remote` operation. Always
   * resolves: transient failures (network error, authentication
   * failure, missing remote) yield `{ reachable: false }` rather than
   * throwing, so `CheckUpdates` can still produce a report row.
   *
   * When a `range` is supplied the `latestSatisfying` field is
   * populated with the highest remote version satisfying it. Without a
   * range, `latestSatisfying` is left undefined and the caller may
   * compute it themselves.
   */
  queryRemote(
    source: Source,
    options?: { remoteUrl?: string; range?: VersionRange | string },
  ): Promise<RemoteQueryOutcome>;
}

const FILE_PROTOCOL = 'file:';
const HTTPS_PROTOCOL = 'https:';
const SSH_PREFIX = 'git@';

// Git environment settings that keep clone/ls-remote non-interactive.
// `GIT_TERMINAL_PROMPT=0` suppresses the credential prompt and
// `GCM_INTERACTIVE=never` opts out of Git Credential Manager popups.
const NON_INTERACTIVE_GIT_ENV = {
  GIT_TERMINAL_PROMPT: 0,
  GCM_INTERACTIVE: 'never',
} as const;

/**
 * Block timeout for git operations. Mirrors the historical behaviour
 * of `ModuleManager.gitTimeout`: a 15-second base, doubled in CI, plus
 * a 50 % bump on Windows.
 */
function gitTimeout(): number {
  const baseTimeout = 15000;
  const isCI = process.env.CI;
  const isWindows = process.platform === 'win32';

  let timeout = baseTimeout;
  if (isCI) timeout *= 2;
  if (isWindows) timeout *= 1.5;

  return timeout;
}

/** True when `location` is a git remote (HTTPS or SSH). */
function isGitLocation(location: string): boolean {
  return location.startsWith(HTTPS_PROTOCOL) || location.startsWith(SSH_PREFIX);
}

/** True when `location` is a `file:` URL. */
function isFileLocation(location: string): boolean {
  return location.startsWith(FILE_PROTOCOL);
}

/** Strip the `file:` prefix from a `file:<path>` URL if present. */
function stripFileProtocol(location: string): string {
  return isFileLocation(location)
    ? location.substring(FILE_PROTOCOL.length)
    : location;
}

/**
 * Build git clone options. Always `--depth 1` (shallow); `--branch ref`
 * pins to a specific tag or branch when `ref` is given, otherwise the
 * default branch is cloned.
 */
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
      // File sources: no filesystem mutation — return the resolved
      // path so the caller can copy files from it.
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
      // Transient or permanent failure reaching the remote — the spec
      // mandates we return an unreachable outcome rather than throw.
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

/**
 * Construct the default {@link SourceLayer} implementation — a thin
 * wrapper around `simple-git` and {@link GitManager.listRemoteVersionTags}.
 */
export function createSourceLayer(): SourceLayer {
  return new DefaultSourceLayer();
}
