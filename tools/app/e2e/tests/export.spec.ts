// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Download, Page } from '@playwright/test';
import {
  asciidoctorPdfInstalled,
  holdsCard,
} from '../../../data-handler/test/helpers/pdf.js';
import { test, expect, waitForListening } from '../fixtures.js';
import { createExportCards, type ExportCards } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

const PREFIX = 'bat';
const CLI = join(import.meta.dirname, '..', '..', '..', 'cli', 'bin', 'run');

const treeNode = (page: Page, title: string) =>
  page.locator('.treenode').filter({ hasText: title });

const heading = (page: Page, title: string) =>
  page.getByRole('heading', { level: 1, name: title, exact: true });

// Clicks the dialog's export button; returns the request body and the PDF.
async function exportPdf(page: Page) {
  const response = page.waitForResponse(
    (res) =>
      res.request().method() === 'POST' &&
      new URL(res.url()).pathname.endsWith('/cards/export-pdf'),
  );
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: t.export, exact: true })
    .click();
  const res = await response;
  expect(res.ok(), await res.text()).toBe(true);
  return {
    body: res.request().postDataJSON() as Record<string, unknown>,
    download: await download,
  };
}

async function readPdf(download: Download, name: string) {
  expect(download.suggestedFilename()).toBe(name);
  // A stream, unlike path(), also works with a remote browser
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) {
    chunks.push(chunk as Buffer);
  }
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  return pdf;
}

let keys: ExportCards;

test.beforeAll(async ({ backend, resetProject }) => {
  await resetProject();
  keys = await createExportCards(backend.baseURL);
});

// CI installs asciidoctor-pdf on every OS, so a missing binary there is a
// failure, not a skip.
test.describe('PDF export', () => {
  test.skip(
    !asciidoctorPdfInstalled && !process.env.CI,
    'asciidoctor-pdf is not installed',
  );
  // asciidoctor-pdf is slow to start, the more so when workers run together.
  test.slow();

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
    const pdf = await readPdf(download, 'card-export.pdf');
    // The hidden child card is in the document
    expect(holdsCard(pdf, keys.hiddenNoteKey)).toBe(true);
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
    const pdf = await readPdf(download, 'project-export.pdf');
    expect(holdsCard(pdf, keys.exportStartKey)).toBe(true);
    expect(holdsCard(pdf, keys.hiddenNoteKey)).toBe(false);
  });
});

// Serves an exported site with `cyberismo preview` on a port the OS picks.
async function previewSite(dir: string): Promise<{
  proc: ChildProcess;
  url: string;
}> {
  const proc = spawn(process.execPath, [CLI, 'preview', dir], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  try {
    const port = await waitForListening(proc);
    return { proc, url: `http://127.0.0.1:${port}` };
  } catch (error) {
    proc.kill();
    throw error;
  }
}

test.describe('Static site export', () => {
  let siteDir: string;
  let site: { proc: ChildProcess; url: string } | undefined;

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
    if (site && site.proc.exitCode === null) {
      const exited = new Promise((resolve) => site!.proc.once('exit', resolve));
      site.proc.kill();
      await exited;
    }
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
    site = await previewSite(siteDir);
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
    expect(stdout).toContain(`Exported site to ${siteDir} with 1 warning\n`);
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
    await expect(treeNode(page, 'Export start')).toBeVisible();
    await expect(treeNode(page, 'Hidden note')).toHaveCount(0);
  });
});
