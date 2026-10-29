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

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreviewApp } from '../src/index.js';

const names = [
  'a#b.pdf',
  'c&d.pdf',
  'e+f.pdf',
  'q?x.pdf',
  '50%.pdf',
  'my file.pdf',
  'ä ö.pdf',
];
let tmp: string;
let app: ReturnType<typeof createPreviewApp>;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'preview-'));
  const site = join(tmp, 'site');
  await mkdir(site);
  await writeFile(join(site, 'index.html'), '<html>index</html>');
  for (const n of names) await writeFile(join(site, n), `bytes of ${n}`);
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

  test.each([
    '/..%2Fsecret',
    '/%2E%2E%2Fsecret',
    '/..%5Csecret',
    '/%2e%2e/secret',
  ])('does not serve files outside the root via %s', async (url) => {
    const res = await app.request(url);
    expect(await res.text()).not.toContain('SECRET');
  });
});
