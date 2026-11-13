// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Context, MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';

/**
 * index.html names the hashed bundles of one build, so the browser must
 * revalidate it on every load. A cached copy from an earlier build would
 * request bundles that no longer exist and leave the page blank.
 */
export const INDEX_CACHE_CONTROL = 'no-cache';

/** Bundles under /assets/ carry a content hash, so they never change. */
export const ASSET_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** True for paths of the hashed bundles Vite emits. */
export function isAssetPath(requestPath: string): boolean {
  return requestPath.startsWith('/assets/');
}

/**
 * Serves the built frontend from `root`, with cache headers that keep a
 * browser from pairing an old index.html with a newer build.
 * @param root - Directory to serve
 * @param options - Extra serveStatic options, such as path rewriting
 */
export function serveFrontend(
  root: string,
  options: Pick<
    NonNullable<Parameters<typeof serveStatic>[0]>,
    'allowPercentInPath' | 'rewriteRequestPath'
  > = {},
): MiddlewareHandler {
  // Only files served from disk get these headers, not the responses of
  // later handlers that serveStatic falls through to.
  const servedFromDisk = new WeakSet<Context>();
  return every(
    async (c, next) => {
      await next();
      if (!servedFromDisk.has(c)) return;
      if (c.res.headers.get('Content-Type')?.startsWith('text/html')) {
        c.res.headers.set('Cache-Control', INDEX_CACHE_CONTROL);
      } else if (isAssetPath(c.req.path)) {
        c.res.headers.set('Cache-Control', ASSET_CACHE_CONTROL);
      }
    },
    serveStatic({
      ...options,
      root,
      onFound: (_path, c) => void servedFromDisk.add(c),
    }),
  );
}

/**
 * Answers a path that matched no route and no file. Client-side routes get
 * index.html; a missing bundle gets a 404, since index.html served as a
 * script fails to load and leaves the page blank.
 */
export async function frontendFallback(c: Context, indexPath: string) {
  if (isAssetPath(c.req.path)) {
    return c.text('Not Found', 404);
  }
  const file = await readFile(indexPath);
  c.header('Cache-Control', INDEX_CACHE_CONTROL);
  return c.html(file.toString());
}
