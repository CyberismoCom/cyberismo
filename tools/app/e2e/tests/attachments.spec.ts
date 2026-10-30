// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.js';
import { editPage, dismissSaveToast, createPage } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

// Open the golden project's root card (the only card after a reset).
async function openRootCard(page: Page) {
  await page
    .locator('p')
    .filter({ hasText: /^Untitled page content$/ })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
  ).toBeVisible();
}

// Add cyberismo.png through the add-attachment modal (assumes it is open)
// and dismiss the success toast.
async function addPngAttachment(page: Page) {
  await page
    .getByTestId('fileUploadButton')
    .locator('input[type="file"]')
    .setInputFiles('./e2e/assets/cyberismo.png');
  await page.getByRole('dialog').getByRole('button', { name: t.add }).click();

  const toast = page
    .getByRole('presentation')
    .filter({ hasText: t.addAttachmentModal.success });
  await expect(toast).toBeVisible();
  await toast.getByTestId('notificationClose').click();
  await expect(toast).toHaveCount(0);
}

// Upload cyberismo.png to the open card through the API.
async function uploadPngViaApi(page: Page) {
  const urlMatch = page.url().match(/\/projects\/([^/]+)\/cards\/([^/?#]+)/);
  if (!urlMatch) {
    throw new Error(`expected /projects/<prefix>/cards/<key>: ${page.url()}`);
  }
  const [, prefix, cardKey] = urlMatch;
  const response = await page.request.post(
    `/api/projects/${prefix}/cards/${cardKey}/attachments`,
    {
      multipart: {
        files: {
          name: 'cyberismo.png',
          mimeType: 'image/png',
          buffer: readFileSync('./e2e/assets/cyberismo.png'),
        },
      },
    },
  );
  expect(response.ok()).toBeTruthy();
}

test.describe('Attachments', () => {
  test.beforeEach(async ({ page, resetProject }) => {
    await resetProject();
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('adds an attachment image to card', async ({ page }) => {
    await openRootCard(page);

    await page.getByTestId('contextMenuButton').click();
    await page.getByRole('menuitem', { name: t.addAttachment }).click();

    // Verify add attachment dialog contents
    await expect(
      page.getByRole('dialog').locator('h2', { hasText: t.addAttachment }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('button').first(),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: t.cancel }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: t.add }),
    ).toBeVisible();

    // The upload button is a <label> wrapping a hidden <input>
    await addPngAttachment(page);

    // After a successful attachment add, CardBody should auto-enter edit mode
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(
      page.getByTestId('cardSidebar').filter({ hasText: 'cyberismo.png' }),
    ).toBeVisible();

    // Regression: clicking outside the editor must NOT exit edit mode
    await page.getByTestId('metadataView').click();
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Check that attachment side panel element exists and "hover" over it to show action buttons
    await page.locator('span', { hasText: 'cyberismo.png' }).hover();
    await page.getByTestId('insertToContentButton').click();
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(page.locator('.doc img[alt="cyberismo"]')).toBeVisible();
  });

  test('removes the attachment', async ({ page }) => {
    await openRootCard(page);

    await uploadPngViaApi(page);
    await page.reload();

    // Enter inline edit mode so the AttachmentPanel is rendered
    await editPage(page);
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(page.getByTestId('attachmentCountBadge')).toHaveText('1');

    // Accept the browser confirm dialog that the delete button triggers
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('[data-attachment-preview] img').hover();
    await page.locator('[aria-label="Delete"]').hover();
    await page.locator('[aria-label="Delete"]').click();

    // After deletion the count badge shows 0
    await expect(page.getByTestId('attachmentCountBadge')).toHaveText('0');
  });

  test('adds a second attachment immediately after the first', async ({
    page,
  }) => {
    await openRootCard(page);

    // Enter edit mode so the AttachmentPanel add button is rendered;
    // both adds must go through the same panel button so the same modal
    // instance is reused (its file list state persists between opens)
    await editPage(page);
    await expect(page.locator('.cm-editor')).toBeVisible();

    // First attachment
    await page.getByTestId('addAttachmentButton').click();
    await addPngAttachment(page);

    // Test second attachment
    await page.getByTestId('addAttachmentButton').click();
    await page
      .getByTestId('fileUploadButton')
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'notes.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('second attachment'),
      });
    await page.getByRole('dialog').getByRole('button', { name: t.add }).click();

    const secondToast = page
      .getByRole('presentation')
      .filter({ hasText: t.addAttachmentModal.success });
    await expect(secondToast).toBeVisible();
    await secondToast.getByTestId('notificationClose').click();
    await expect(secondToast).toHaveCount(0);

    // Both attachments ended up on the card
    await expect(page.getByTestId('attachmentCountBadge')).toHaveText('2');
  });

  // Either side of the 1200px (lg) breakpoint.
  const WIDE = { width: 1400, height: 800 };
  const NARROW = { width: 1000, height: 800 };

  const defaultCases = [
    { name: 'wide view', viewport: WIDE, edit: false, expanded: false },
    { name: 'wide edit', viewport: WIDE, edit: true, expanded: true },
    { name: 'narrow view', viewport: NARROW, edit: false, expanded: false },
    { name: 'narrow edit', viewport: NARROW, edit: true, expanded: false },
  ];

  for (const { name, viewport, edit, expanded } of defaultCases) {
    test(`panel starts ${expanded ? 'expanded' : 'collapsed'}: ${name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openRootCard(page);
      await uploadPngViaApi(page);
      await page.reload();
      if (edit) {
        await editPage(page);
        await expect(page.locator('.cm-editor')).toBeVisible();
      }

      const panel = page.getByTestId('cardAttachmentsPanel');
      await expect(page.getByTestId('attachmentCountBadge')).toHaveText('1');
      const toggle = panel.getByRole('button', { name: t.attachments });
      await expect(toggle).toHaveAttribute('aria-expanded', String(expanded));

      // Toggling works from either default.
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', String(!expanded));
      if (expanded === false) {
        await expect(panel.locator('a[download]')).toHaveAttribute(
          'href',
          /cyberismo\.png$/,
        );
      }
    });
  }

  test('returning from edit to view collapses the panel again', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await openRootCard(page);
    await uploadPngViaApi(page);
    await page.reload();

    const toggle = page
      .getByTestId('cardAttachmentsPanel')
      .getByRole('button', { name: t.attachments });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await editPage(page);
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.getByTestId('contentCancelButton').click();
    await expect(page.locator('.cm-editor')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('navigating to another card collapses an expanded panel', async ({
    page,
  }) => {
    await page.setViewportSize(WIDE);
    await openRootCard(page);
    // Visit both cards first so switching between them is served from the
    // SWR cache and the card layout stays mounted.
    await createPage(page);
    const tree = (name: RegExp) => page.locator('p').filter({ hasText: name });
    await tree(/^Untitled page content$/).click();

    const toggle = page
      .getByTestId('cardAttachmentsPanel')
      .getByRole('button', { name: t.attachments });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await tree(/^Untitled page$/).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
