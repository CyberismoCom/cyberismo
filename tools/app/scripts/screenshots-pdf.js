// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Puts the before and after screenshots that screenshots.js wrote into one
 * PDF, so that a pull request needs only one upload.
 *
 * Usage:
 *   node tools/app/scripts/screenshots-pdf.js --title <title>
 *     [--out <dir>] [--file <name>]
 *
 * Reads the pairs <name>-<scheme>-before.png and <name>-<scheme>-after.png in
 * <out> and writes <out>/<file> (default before-after.pdf): a cover page, then
 * one A4 page for each pair, with the before screenshot above the after one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values } = parseArgs({
  options: {
    title: { type: 'string' },
    out: {
      type: 'string',
      default: join(
        import.meta.dirname,
        '..',
        '..',
        '..',
        '.tmp',
        'screenshots',
      ),
    },
    file: { type: 'string', default: 'before-after.pdf' },
  },
});

if (!values.title) {
  console.error('Usage: screenshots-pdf.js --title <title> [--out <dir>]');
  process.exit(1);
}

const files = readdirSync(values.out);
const pairs = files
  .filter((file) => file.endsWith('-before.png'))
  .map((before) => {
    const stem = before.slice(0, -'-before.png'.length);
    const split = stem.lastIndexOf('-');
    return {
      name: stem.slice(0, split),
      scheme: stem.slice(split + 1),
      before,
      after: `${stem}-after.png`,
    };
  })
  .filter(({ after }) => files.includes(after))
  // Each screen in light, then in dark.
  .sort(
    (a, b) =>
      a.name.localeCompare(b.name) ||
      (a.scheme === 'light' ? -1 : b.scheme === 'light' ? 1 : 0),
  );
const heading = ({ name, scheme }) => `${name} (${scheme})`;

if (pairs.length === 0) {
  console.error(`No before and after pairs in ${values.out}`);
  process.exit(1);
}

const escape = (text) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const image = (file) =>
  `data:image/png;base64,${readFileSync(join(values.out, file)).toString('base64')}`;

const pages = pairs.map(
  (pair) => `
  <section class="page">
    <h2>${escape(heading(pair))}</h2>
    <p class="label">Before</p><img src="${image(pair.before)}">
    <p class="label">After</p><img src="${image(pair.after)}">
  </section>`,
);

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
  @page { size: A4; margin: 12mm; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #171a1c; }
  .page { break-after: page; }
  h1 { font-size: 22pt; margin: 0 0 4mm; }
  h2 { font-size: 13pt; margin: 0 0 3mm; }
  .label { font-size: 9pt; font-weight: 600; margin: 3mm 0 1mm; color: #555e68; }
  img { display: block; width: 100%; border: 1px solid #cdd7e1; }
  li { font-size: 11pt; margin: 1mm 0; }
</style></head><body>
  <section class="page">
    <h1>${escape(values.title)}</h1>
    <p>Before and after screenshots, one page for each screen and colour scheme:</p>
    <ul>${pairs.map((pair) => `<li>${escape(heading(pair))}</li>`).join('')}</ul>
  </section>
  ${pages.join('')}
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  const file = join(values.out, values.file);
  await page.pdf({ path: file, format: 'A4', printBackground: true });
  console.log(file);
} finally {
  await browser.close();
}
