// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Context, MiddlewareHandler } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
  // serveStatic calls onFound after it has built the response, so a header
  // set there never reaches the client; set it on the returned response.
  const servedFiles = new WeakMap<Context, string>();
  const serve = serveStatic({
    root,
    onFound: (filePath, c) => {
      servedFiles.set(c, filePath);
    },
  });
  return async (c, next) => {
    const res = await serve(c, next);
    const filePath = servedFiles.get(c);
    if (!res || !filePath) return res;
    if (path.extname(filePath) === '.html') {
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
