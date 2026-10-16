// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { PublishResult } from '@cyberismo/model';
import type { Checkout } from '../../state/checkout/checkout.js';
import { GitManager } from '../../infra/git/git-manager.js';

/**
 * Tags the current project version for publishing; pushing the tag is the
 * caller's.
 *
 * @param dryRun If true, returns what would happen without doing it
 * @returns The published version string
 */
export async function tagVersion(
  checkout: Checkout,
  dryRun: boolean,
  remote?: string,
): Promise<PublishResult> {
  const { git } = checkout;
  const version = checkout.configuration.version;
  const resolvedRemote = remote || GitManager.DEFAULT_REMOTE;

  // Guard: no version set
  if (!version) {
    throw new Error(
      "No version set. Run 'cyberismo create version <bump>' first.",
    );
  }

  // Guard: version already tagged
  const tags = await git.listVersionTags();
  if (tags.includes(`v${version}`)) {
    throw new Error(
      `Version v${version} is already published. Bump the version first.`,
    );
  }

  if (!dryRun) {
    const tagMessage = `Release v${version}`;
    await git.tagVersion(version, tagMessage);
  }

  return { version, remote: resolvedRemote, dryRun };
}
