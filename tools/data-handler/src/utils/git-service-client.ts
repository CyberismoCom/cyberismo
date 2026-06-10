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

import { join } from 'node:path';

const GIT_SERVICE_URL = (process.env.GIT_SERVICE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

/**
 * Root directory where git-service writes clones. Defaults to `/project`
 * (the static shared volume in SaaS). Override with `GIT_SERVICE_PROJECT_ROOT`
 * for local development when git-service runs outside a container.
 */
const PROJECT_ROOT =
  (process.env.GIT_SERVICE_PROJECT_ROOT ?? '/project')
    .trim()
    .replace(/\/+$/, '') || '/project';
/** Subdirectory under PROJECT_ROOT where git-service writes clones. */

export function isGitServiceEnabled(): boolean {
  return GIT_SERVICE_URL.length > 0;
}

async function requestJson(pathAndQuery: string, init?: RequestInit) {
  const url = `${GIT_SERVICE_URL}${pathAndQuery}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const detail =
      body &&
      typeof body === 'object' &&
      typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `git-service request failed (${response.status})`;
    throw new Error(detail);
  }

  return body;
}

export function resolveGitServiceClonePath(clonePath: string): string {
  if (!clonePath || clonePath.startsWith('/')) {
    throw new Error('git-service returned invalid clone path');
  }
  return join(PROJECT_ROOT, clonePath);
}

/**
 * Proxy an HTTP fetch through the git-service /hub endpoint when git-service
 * is enabled (outbound access is blocked in SaaS). Falls back to direct fetch
 * when git-service is not configured.
 */
export async function hubFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!isGitServiceEnabled()) {
    return fetch(url, init);
  }
  const proxyUrl = `${GIT_SERVICE_URL}/hub?url=${encodeURIComponent(url)}`;
  return fetch(proxyUrl, {
    ...init,
    method: 'GET',
    headers: {
      Accept:
        (init?.headers as Record<string, string>)?.['Accept'] ??
        'application/json',
    },
  });
}

export async function fetchTags(url: string): Promise<string[]> {
  const query = `/tags?url=${encodeURIComponent(url)}`;
  const body = await requestJson(query);

  if (Array.isArray(body) && body.every((item) => typeof item === 'string')) {
    return body;
  }

  if (
    body &&
    typeof body === 'object' &&
    Array.isArray((body as { tags?: unknown }).tags)
  ) {
    const tags = (body as { tags: unknown[] }).tags;
    if (tags.every((item) => typeof item === 'string')) {
      return tags as string[];
    }
  }

  throw new Error('git-service returned invalid tags payload');
}

export async function clone(options: {
  url: string;
  ref?: string;
  shallow?: boolean;
}): Promise<string> {
  const body = await requestJson('/clone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: options.url,
      ref: options.ref,
      shallow: options.shallow,
    }),
  });

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  if (
    body &&
    typeof body === 'object' &&
    typeof (body as { path?: unknown }).path === 'string'
  ) {
    return (body as { path: string }).path;
  }

  throw new Error('git-service returned invalid clone payload');
}
