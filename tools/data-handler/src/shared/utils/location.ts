// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

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
