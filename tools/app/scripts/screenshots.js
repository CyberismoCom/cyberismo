// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Takes screenshots of a running app for the before and after table of a
 * pull request.
 *
 * Usage:
 *   node tools/app/scripts/screenshots.js --project <prefix> --label <label>
 *     [--out <dir>] [--base-url <url>] [--schemes light,dark]
 *     <name>=<path> [<name>=<path> ...]
 *
 * Each <path> is relative to /projects/<prefix>, for example
 * card=/cards/docs_2 or general=/configuration/general. The script writes
 * <out>/<name>-<scheme>-<label>.png at 1440 x 900. Run it once with
 * --label before and once with --label after to get matching pairs.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values, positionals } = parseArgs({
  options: {
    project: { type: 'string' },
    label: { type: 'string' },
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
    'base-url': { type: 'string', default: 'http://localhost:5173' },
    schemes: { type: 'string', default: 'light,dark' },
  },
  allowPositionals: true,
});

if (!values.project || !values.label || positionals.length === 0) {
  console.error(
    'Usage: screenshots.js --project <prefix> --label <label> <name>=<path> ...',
  );
  process.exit(1);
}

const routes = positionals.map((arg) => {
  // Split at the first '=' only: a path can hold a query string.
  const split = arg.indexOf('=');
  const name = arg.slice(0, split);
  const path = arg.slice(split + 1);
  if (split < 1 || !path.startsWith('/')) {
    console.error(`Expected <name>=/<path>, got "${arg}"`);
    process.exit(1);
  }
  return { name, path };
});

mkdirSync(values.out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const scheme of values.schemes.split(',')) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: scheme,
    });
    const page = await context.newPage();
    for (const { name, path } of routes) {
      const url = `${values['base-url']}/projects/${values.project}${path}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      // Lets the tree select its node and fonts settle after the network.
      await page.waitForTimeout(1000);
      const file = join(values.out, `${name}-${scheme}-${values.label}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
