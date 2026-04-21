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
 * when the source is private. Non-private or non-HTTPS sources pass through.
 *
 * @throws when a private HTTPS `location` cannot be parsed as a URL.
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
