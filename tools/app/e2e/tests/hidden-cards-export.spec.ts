// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile } from 'node:child_process';
import { readFile, rm, stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

const PREFIX = 'bat';
const CLI = join(import.meta.dirname, '..', '..', '..', 'cli', 'bin', 'run');

type Keys = {
  rootCardKey: string;
  exportStartKey: string;
  hiddenNoteKey: string;
  outsideCardKey: string;
};

// Adds these cards under the project's only card. The setup script's
// calculation hides cards titled 'Hidden note' from the tree view.
//   Untitled page content
//     Export start: links to Outside card, in its content and links
//       Hidden note
//     Outside card
async function createCards(baseURL: string): Promise<Keys> {
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(`${baseURL}/api/projects/${PREFIX}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    }
    return res.json();
  };
  const create = async (parent: string, title: string, content = '') => {
    const [card] = (await api(`/cards/${parent}`, 'POST', {
      template: 'test/templates/page',
    })) as { key: string }[];
    await api(`/cards/${card.key}`, 'PATCH', { metadata: { title }, content });
    return card.key;
  };
  const [{ key: rootCardKey }] = (await api('/tree')) as { key: string }[];
  const outsideCardKey = await create(rootCardKey, 'Outside card');
  const exportStartKey = await create(
    rootCardKey,
    'Export start',
    `See xref:${outsideCardKey}.adoc[the outside card].`,
  );
  const hiddenNoteKey = await create(exportStartKey, 'Hidden note');
  await api(`/cards/${exportStartKey}/links`, 'POST', {
    toCard: outsideCardKey,
    linkType: 'test/linkTypes/test',
  });
  return { rootCardKey, exportStartKey, hiddenNoteKey, outsideCardKey };
}

const treeNode = (page: Page, title: string) =>
  page.locator('.treenode').filter({ hasText: title });

const heading = (page: Page, title: string) =>
  page.getByRole('heading', { level: 1, name: title, exact: true });

let keys: Keys;

test.beforeAll(async ({ backend, resetProject }) => {
  await resetProject();
  keys = await createCards(backend.baseURL);
});

test.describe('Hidden cards', () => {
  test('a hidden card is left out of the sidebar but has breadcrumbs', async ({
    page,
  }) => {
    // The sidebar opens the selected card, so a visible child would show.
    await page.goto(`/projects/${PREFIX}/cards/${keys.exportStartKey}`);
    await expect(heading(page, 'Export start')).toBeVisible();
    await expect(treeNode(page, 'Export start')).toBeVisible();
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);

    await page.goto(`/projects/${PREFIX}/cards/${keys.hiddenNoteKey}`);
    await expect(heading(page, 'Hidden note')).toBeVisible();
    const breadcrumbs = page.locator('.breadcrumbs');
    for (const name of [
      'Untitled page content',
      'Export start',
      `Hidden note - ${keys.hiddenNoteKey}`,
    ]) {
      await expect(
        breadcrumbs.getByRole('link', { name, exact: true }),
      ).toBeVisible();
    }
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);
  });

  test('the link editor offers a hidden card as a target', async ({ page }) => {
    await page.goto('/');
    await expect(heading(page, 'Untitled page content')).toBeVisible();

    await page.getByTestId('linkIconButton').click();
    await page
      .locator('.MuiSelect-button', { hasText: t.linkForm.selectLinkType })
      .click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'Outbound', exact: true })
      .click();
    await page.locator('[placeholder="Search card"]').fill('Hidden note');
    await expect(
      page.locator('.MuiAutocomplete-option', { hasText: 'Hidden note' }),
    ).toBeVisible();
  });

  test('exports a card with its hidden child cards to PDF', async ({
    page,
  }) => {
    await page.goto(`/projects/${PREFIX}/cards/${keys.exportStartKey}`);
    await expect(heading(page, 'Export start')).toBeVisible();

    await page.getByTestId('contextMenuButton').click();
    await page.getByRole('menuitem', { name: t.exportCard }).click();
    const dialog = page.getByRole('dialog');
    const includeHidden = dialog.getByRole('checkbox', {
      name: t.exportIncludeHidden,
    });
    await expect(includeHidden).toBeDisabled();
    await dialog.getByRole('checkbox', { name: t.exportChildCards }).check();
    await expect(includeHidden).toBeEnabled();
    await includeHidden.check();

    const requestPromise = page.waitForRequest(
      (req) =>
        req.method() === 'POST' &&
        new URL(req.url()).pathname.endsWith('/cards/export-pdf'),
    );
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await dialog.getByRole('button', { name: t.export, exact: true }).click();

    expect((await requestPromise).postDataJSON()).toMatchObject({
      cardKey: keys.exportStartKey,
      exportChildCards: true,
      includeHidden: true,
    });
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('card-export.pdf');
    const pdf = await readFile(await download.path());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
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

test.describe('Static site export of a card', () => {
  let siteDir: string;
  let site: { server: Server; url: string };

  test.beforeAll(async ({ backend }, testInfo) => {
    testInfo.setTimeout(180_000);
    siteDir = join(
      backend.projectPath,
      '..',
      `site-export-w${testInfo.workerIndex}`,
    );
    await rm(siteDir, { recursive: true, force: true });
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [
        CLI,
        'export',
        'site',
        siteDir,
        keys.exportStartKey,
        '-r',
        '--include-hidden',
        '-p',
        backend.projectPath,
      ],
      { encoding: 'utf8' },
    );
    expect(stdout).toContain(`Exported site to ${siteDir} with 1 warning`);
    expect(stderr).toContain(keys.outsideCardKey);
    site = await serveSite(siteDir);
  });

  test.afterAll(async () => {
    site?.server.close();
    if (siteDir) {
      await rm(siteDir, { recursive: true, force: true, maxRetries: 5 });
    }
  });

  test('holds an included hidden card outside the sidebar, and a link outside the export as text', async ({
    page,
  }) => {
    const cardUrl = (key: string) =>
      `${site.url}/projects/${PREFIX}/cards/${key}`;

    await page.goto(cardUrl(keys.exportStartKey));
    await expect(heading(page, 'Export start')).toBeVisible();
    // The sidebar opens the selected card, so a visible child would show.
    await expect(treeNode(page, 'Export start')).toBeVisible();
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);
    await expect(treeNode(page, 'Outside card')).toHaveCount(0);

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

    await page.goto(cardUrl(keys.hiddenNoteKey));
    await expect(heading(page, 'Hidden note')).toBeVisible();
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);
  });
});
