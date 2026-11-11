// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Context, MiddlewareHandler } from 'hono';
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
 */
export function serveFrontend(root: string): MiddlewareHandler {
  const serve = serveStatic({ root });
  return async (c, next) => {
    // serveStatic returns a Response only when it found a file. Otherwise it
    // returns what next() resolved to: undefined, or the Context when a later
    // handler (e.g. a catch-all route) answered.
    const res = await serve(c, next);
    if (!(res instanceof Response)) return res;
    if (res.headers.get('Content-Type')?.startsWith('text/html')) {
      res.headers.set('Cache-Control', INDEX_CACHE_CONTROL);
    } else if (isAssetPath(c.req.path)) {
      res.headers.set('Cache-Control', ASSET_CACHE_CONTROL);
    }
    return res;
  };
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
