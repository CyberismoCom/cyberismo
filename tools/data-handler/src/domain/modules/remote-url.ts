// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Credentials, Source } from '@cyberismo/model';

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
    let repoUrl: URL;
    try {
      repoUrl = new URL(source.location);
    } catch {
      throw new Error(`Invalid repository URL: ${source.location}`);
    }
    // The WHATWG URL setters percent-encode the userinfo component
    // themselves, so `@`, `/`, `:` and other reserved characters round-
    // trip through the remote correctly. String interpolation would
    // place them in positions the parser reinterprets.
    repoUrl.username = credentials.username;
    repoUrl.password = credentials.token;
    return repoUrl.toString();
  }
  return source.location;
}
