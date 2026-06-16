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

import { join, resolve, sep } from 'node:path';
import { z } from 'zod';

const errorResponseSchema = z.object({ error: z.string() });

const tagsResponseSchema = z.object({ tags: z.array(z.string()) });

const cloneResponseSchema = z.object({ path: z.string() });

const GIT_SERVICE_URL = (process.env.GIT_SERVICE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');

/**
 * Root directory where git-service writes clones — the directory from which
 * the application was started.
 */
const PROJECT_ROOT = process.cwd();
export function isGitServiceEnabled(): boolean {
  return GIT_SERVICE_URL.length > 0;
}

async function requestJson(
  pathAndQuery: string,
  options?: { method?: string; json?: unknown },
) {
  const url = new URL(pathAndQuery, GIT_SERVICE_URL).toString();
  const hasBody = options?.json !== undefined;
  const response = await fetch(url, {
    method: options?.method,
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(options.json) : undefined,
  });

  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    const detail = parsed.success
      ? parsed.data.error
      : `git-service request failed (${response.status}): unexpected response format: ${JSON.stringify(body)}`;
    throw new Error(detail);
  }

  return body;
}

export function resolveGitServiceClonePath(clonePath: string): string {
  if (!clonePath || clonePath.startsWith('/') || clonePath.startsWith('\\')) {
    throw new Error('git-service returned invalid clone path');
  }
  const resolved = resolve(join(PROJECT_ROOT, clonePath));
  if (!resolved.startsWith(PROJECT_ROOT + sep) && resolved !== PROJECT_ROOT) {
    throw new Error('git-service returned invalid clone path');
  }
  return resolved;
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

  const parsed = tagsResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new Error('git-service returned invalid tags payload');
  return parsed.data.tags;
}

export async function clone(options: {
  url: string;
  ref?: string;
  shallow?: boolean;
}): Promise<string> {
  const body = await requestJson('/clone', {
    method: 'POST',
    json: { url: options.url, ref: options.ref, shallow: options.shallow },
  });

  const parsed = cloneResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new Error('git-service returned invalid clone payload');
  return parsed.data.path;
}
