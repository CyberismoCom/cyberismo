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

/** Prefix used by HTTPS git remote URLs. */
export const HTTPS_PROTOCOL = 'https:';

/** Prefix used by `file:<path>` source locations. */
export const FILE_PROTOCOL = 'file:';

/** Prefix used by SSH git remote URLs (`git@host:path`). */
export const SSH_PREFIX = 'git@';

/** True when `location` is a git remote (HTTPS or SSH). */
export function isGitLocation(location: string): boolean {
  return location.startsWith(HTTPS_PROTOCOL) || location.startsWith(SSH_PREFIX);
}

/** True when `location` is a `file:` URL. */
export function isFileLocation(location: string): boolean {
  return location.startsWith(FILE_PROTOCOL);
}

/** Strip the `file:` prefix from a `file:<path>` URL if present. */
export function stripFileProtocol(location: string): string {
  return isFileLocation(location)
    ? location.substring(FILE_PROTOCOL.length)
    : location;
}
