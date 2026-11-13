// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';
import type { Download, Page } from '@playwright/test';
import { test, expect } from '../fixtures.js';
import { createExportCards, type ExportCards } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

const PREFIX = 'bat';
const CLI = join(import.meta.dirname, '..', '..', '..', 'cli', 'bin', 'run');

const treeNode = (page: Page, title: string) =>
  page.locator('.treenode').filter({ hasText: title });

const heading = (page: Page, title: string) =>
  page.getByRole('heading', { level: 1, name: title, exact: true });

// Clicks the dialog's export button; returns the request body and the download.
async function exportPdf(page: Page) {
  const request = page.waitForRequest(
    (req) =>
      req.method() === 'POST' &&
      new URL(req.url()).pathname.endsWith('/cards/export-pdf'),
  );
  const download = page.waitForEvent('download', { timeout: 60_000 });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: t.export, exact: true })
    .click();
  return {
    body: (await request).postDataJSON() as Record<string, unknown>,
    download: await download,
  };
}

async function expectPdf(download: Download, name: string) {
  expect(download.suggestedFilename()).toBe(name);
  const pdf = await readFile(await download.path());
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
}

let keys: ExportCards;

test.beforeAll(async ({ backend, resetProject }) => {
  await resetProject();
  keys = await createExportCards(backend.baseURL);
});

test.describe('PDF export', () => {
  test('exports a card with its child cards, hidden ones included', async ({
    page,
  }) => {
    await page.goto(`/projects/${PREFIX}/cards/${keys.exportStartKey}`);
    await expect(heading(page, 'Export start')).toBeVisible();

    await page.getByTestId('contextMenuButton').click();
    await page.getByRole('menuitem', { name: t.exportCard }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox').first()).toHaveValue(
      'Export start',
    );
    const includeHidden = dialog.getByRole('checkbox', {
      name: t.exportIncludeHidden,
    });
    // Hidden cards are child cards, so only exported with them
    await expect(includeHidden).toBeDisabled();
    await dialog.getByRole('checkbox', { name: t.exportChildCards }).check();
    await expect(includeHidden).toBeEnabled();
    await includeHidden.check();

    const { body, download } = await exportPdf(page);
    expect(body).toMatchObject({
      cardKey: keys.exportStartKey,
      title: 'Export start',
      exportChildCards: true,
      includeHidden: true,
    });
    await expectPdf(download, 'card-export.pdf');
  });

  test('exports the project', async ({ page }) => {
    await page.goto('/');
    await expect(heading(page, 'Untitled page content')).toBeVisible();

    await page.getByTestId('projectMenuButton').click();
    await page.getByRole('menuitem', { name: t.exportProject }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox').first()).toHaveValue(
      'Basic Acceptance Test',
    );
    // A project export always holds every card
    await expect(
      dialog.getByRole('checkbox', { name: t.exportChildCards }),
    ).toHaveCount(0);

    const { body, download } = await exportPdf(page);
    expect(body).toMatchObject({
      cardKey: '',
      exportChildCards: true,
      includeHidden: false,
    });
    await expectPdf(download, 'project-export.pdf');
  });
});

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

// Serves an exported site as a static host would: a file if there is one,
// else index.html, so that the app routes the page. A missing API file is a
// 404, as the app expects in static mode.
async function serveSite(root: string): Promise<{
  server: Server;
  url: string;
}> {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(
      new URL(req.url ?? '/', 'http://localhost').pathname,
    );
    const file = normalize(join(root, pathname));
    let body: Buffer | undefined;
    if (file.startsWith(root + sep)) {
      try {
        if ((await stat(file)).isFile()) body = await readFile(file);
      } catch {
        // not a file of the site
      }
    }
    if (body) {
      res.writeHead(200, {
        'content-type':
          CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
        connection: 'close',
      });
      res.end(body);
    } else if (pathname.startsWith('/api/')) {
      res.writeHead(404, { connection: 'close' });
      res.end();
    } else {
      res.writeHead(200, { 'content-type': 'text/html', connection: 'close' });
      res.end(await readFile(join(root, 'index.html')));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Site server did not report a port');
  }
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test.describe('Static site export', () => {
  let siteDir: string;
  let site: { server: Server; url: string } | undefined;

  test.beforeEach(async ({ backend }, testInfo) => {
    testInfo.setTimeout(180_000);
    siteDir = join(
      backend.projectPath,
      '..',
      `site-export-w${testInfo.workerIndex}`,
    );
    await rm(siteDir, { recursive: true, force: true });
  });

  test.afterEach(async () => {
    site?.server.close();
    site = undefined;
    await rm(siteDir, { recursive: true, force: true, maxRetries: 5 });
  });

  // Exports the site with the CLI and serves it; returns the CLI's output.
  async function exportSite(projectPath: string, ...args: string[]) {
    const output = await promisify(execFile)(
      process.execPath,
      [CLI, 'export', 'site', siteDir, ...args, '-p', projectPath],
      { encoding: 'utf8' },
    );
    site = await serveSite(siteDir);
    return output;
  }

  const cardUrl = (key: string) =>
    `${site!.url}/projects/${PREFIX}/cards/${key}`;

  test('exports the project as a site that opens in the browser', async ({
    page,
    backend,
  }) => {
    const { stdout } = await exportSite(backend.projectPath);
    expect(stdout).toContain(`Exported site to ${siteDir}\n`);

    await page.goto(cardUrl(keys.exportStartKey));
    await expect(heading(page, 'Export start')).toBeVisible();
    for (const title of [
      'Untitled page content',
      'Export start',
      'Outside card',
    ]) {
      await expect(treeNode(page, title)).toBeVisible();
    }
    // The sidebar opens the selected card, so a visible child would show.
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);

    const content = page.locator('.doc');
    await expect(content).toContainText('See the outside card.');
    await content.getByRole('link', { name: 'the outside card' }).click();
    await expect(heading(page, 'Outside card')).toBeVisible();

    await treeNode(page, 'Untitled page content').click();
    await expect(heading(page, 'Untitled page content')).toBeVisible();
  });

  test('exports a card with its hidden child cards, linking only to exported cards', async ({
    page,
    backend,
  }) => {
    const { stdout, stderr } = await exportSite(
      backend.projectPath,
      keys.exportStartKey,
      '-r',
      '--include-hidden',
    );
    expect(stdout).toContain(`Exported site to ${siteDir} with 1 warning`);
    expect(stderr).toContain(keys.outsideCardKey);

    await page.goto(cardUrl(keys.exportStartKey));
    await expect(heading(page, 'Export start')).toBeVisible();
    await expect(treeNode(page, 'Export start')).toBeVisible();
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);
    await expect(treeNode(page, 'Outside card')).toHaveCount(0);

    // Outside card is not part of the export, so its links are text
    const content = page.locator('.doc');
    await expect(content).toContainText('See the outside card.');
    await expect(content.getByRole('link')).toHaveCount(0);
    await page.getByTestId('linkedCardsShowMoreButton').click();
    await expect(
      page.getByTestId('cardLink').filter({ hasText: keys.outsideCardKey }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: keys.outsideCardKey }),
    ).toHaveCount(0);

    // The included hidden card has a page, though not in the sidebar
    await page.goto(cardUrl(keys.hiddenNoteKey));
    await expect(heading(page, 'Hidden note')).toBeVisible();
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);
  });
});
