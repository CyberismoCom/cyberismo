// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  ASSET_CACHE_CONTROL,
  INDEX_CACHE_CONTROL,
  frontendFallback,
  serveFrontend,
} from '../src/frontend.js';

let dir: string;
let app: Hono;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cyberismo-frontend-'));
  await mkdir(path.join(dir, 'assets'));
  await writeFile(path.join(dir, 'index.html'), '<!doctype html><p>app</p>');
  await writeFile(path.join(dir, 'assets', 'index-abc123.js'), 'export {};');
  await writeFile(path.join(dir, 'favicon.png'), 'png');

  app = new Hono();
  app.use(serveFrontend(dir));
  app.notFound((c) => frontendFallback(c, path.join(dir, 'index.html')));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('serving the frontend', () => {
  test.each(['/', '/index.html'])(
    '%s is revalidated on every load',
    async (url) => {
      const res = await app.request(url);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/html/);
      expect(res.headers.get('cache-control')).toBe(INDEX_CACHE_CONTROL);
    },
  );

  test('a client-side route gets index.html, revalidated on every load', async () => {
    const res = await app.request('/projects/demo/cards/demo_1');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<p>app</p>');
    expect(res.headers.get('cache-control')).toBe(INDEX_CACHE_CONTROL);
  });

  test('a hashed bundle is cached as immutable', async () => {
    const res = await app.request('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/javascript/);
    expect(res.headers.get('cache-control')).toBe(ASSET_CACHE_CONTROL);
  });

  test('an unhashed public file gets no cache header', async () => {
    const res = await app.request('/favicon.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBeNull();
  });

  test('a bundle from an earlier build is a 404, not index.html', async () => {
    const res = await app.request('/assets/index-oldbuild.js');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toMatch(/text\/html/);
  });
});
