// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreviewApp } from '../src/index.js';

// Windows filenames cannot contain '?'.
const names = [
  'a#b.pdf',
  'c&d.pdf',
  'e+f.pdf',
  ...(process.platform === 'win32' ? [] : ['q?x.pdf']),
  '50%.pdf',
  'my file.pdf',
  'ä ö.pdf',
];
const INDEX = '<html>index</html>';
let tmp: string;
let app: ReturnType<typeof createPreviewApp>;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'preview-'));
  const site = join(tmp, 'site');
  await mkdir(site);
  await writeFile(join(site, 'index.html'), INDEX);
  for (const n of names) await writeFile(join(site, n), `bytes of ${n}`);
  await mkdir(join(site, 'sub'));
  await writeFile(join(site, 'sub', 'x.txt'), 'bytes of sub/x.txt');
  await writeFile(join(tmp, 'secret'), 'SECRET');
  app = createPreviewApp(site);
});

afterAll(() => rm(tmp, { recursive: true, force: true }));

describe('previewSite static serving', () => {
  test.each(names)('serves %s via encodeURIComponent', async (name) => {
    const res = await app.request(`/${encodeURIComponent(name)}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`bytes of ${name}`);
  });

  // Each would serve the file above the root without the containment check.
  test.each(['/..%2Fsecret', '/%2F..%2Fsecret', '/a/..%2F..%2Fsecret'])(
    'falls through to the index for %s, which leaves the root',
    async (url) => {
      const res = await app.request(url);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(INDEX);
    },
  );

  test('falls through to the index for a path that does not decode', async () => {
    const res = await app.request('/bad%E0');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(INDEX);
  });

  test('treats an encoded slash as a separator inside the root', async () => {
    const res = await app.request('/sub%2Fx.txt');
    expect(await res.text()).toBe('bytes of sub/x.txt');
  });
});
