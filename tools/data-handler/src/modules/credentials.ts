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

import type { Credentials } from '../interfaces/project-interfaces.js';
import type { Source } from './types.js';

const HTTPS_PROTOCOL = 'https:';

/**
 * Build the remote URL for a module source, injecting HTTPS credentials
 * when the source is private. When the source is not private HTTPS or
 * credentials are missing/incomplete, the location passes through
 * verbatim.
 *
 * Lifted out of the original `ModuleManager.buildRemoteUrl` so that
 * every layer that talks to a remote (the resolver's version list /
 * fetch, and `CheckUpdates`' `listRemoteVersions` call) shares one
 * credential-injection site.
 *
 * @throws Error when the source is a private HTTPS remote with valid
 *   credentials but the `location` cannot be parsed as a URL. This is
 *   the only failure mode: non-HTTPS sources and sources without
 *   credentials always return successfully.
 */
export function buildRemoteUrl(
  source: Pick<Source, 'location' | 'private'>,
  credentials?: Credentials,
): string {
  if (
    source.private &&
    credentials?.username &&
    credentials?.token &&
    source.location.startsWith(HTTPS_PROTOCOL)
  ) {
    try {
      const repoUrl = new URL(source.location);
      const user = credentials.username;
      const pass = credentials.token;
      const host = repoUrl.host;
      const path = repoUrl.pathname;
      return `https://${user}:${pass}@${host}${path}`;
    } catch {
      throw new Error(`Invalid repository URL: ${source.location}`);
    }
  }
  return source.location;
}
