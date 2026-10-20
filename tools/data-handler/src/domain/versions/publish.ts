/**
  Cyberismo
  Copyright © Cyberismo Ltd and contributors 2026
  This program is free software: you can redistribute it and/or modify it under
  the terms of the GNU Affero General Public License version 3 as published by
  the Free Software Foundation.
  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
  details. You should have received a copy of the GNU Affero General Public
  License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

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
