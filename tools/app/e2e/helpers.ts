import { type Page, expect } from '@playwright/test';
import t from '../src/locales/en/translation.json' with { type: 'json' };

/** Click the "Edit body" button (force-clickable even when .doc has 0 height). */
export async function editPage(page: Page) {
  await page.getByTestId('editBodyButton').click({ force: true });
}

/** Create a card from the "Page" template via the toolbar dialog. */
export async function createPage(page: Page) {
  await page.getByTestId('createNewButton').click();
  await page
    .locator('.templateCard')
    .getByText('Page', { exact: true })
    .click();
  await page.getByTestId('confirmCreateButton').click();
  await expect(
    page
      .getByRole('presentation')
      .filter({ hasText: t.createCardModal.success }),
  ).toBeVisible();
  await page.getByTestId('notificationClose').first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
  ).toBeVisible();
}

/**
 * Wait for a save toast, dismiss it, and confirm the inline editor unmounted.
 * Mirrors the Cypress `verifyContentSaved` helper.
 */
export async function dismissSaveToast(page: Page) {
  await expect(page.locator('.cm-editor')).toHaveCount(0);
  const toast = page
    .getByRole('presentation')
    .filter({ hasText: t.saveCard.success });
  await expect(toast).toBeVisible();
  await toast.getByTestId('notificationClose').click();
  await expect(toast).toHaveCount(0);
}

/**
 * Type into CodeMirror. Replaces the Cypress `{rightArrow}` / `{moveToEnd}`
 * DSL with explicit keyboard.press calls.
 *
 * @param page Playwright page
 * @param sequence Array of either strings (typed verbatim) or { press: KeyName }.
 */
export async function typeIntoCodeMirror(
  page: Page,
  sequence: Array<string | { press: string }>,
) {
  await page.locator('.cm-content').click();
  for (const step of sequence) {
    if (typeof step === 'string') {
      await page.keyboard.type(step);
    } else {
      await page.keyboard.press(step.press);
    }
  }
}

/** Click the contextMenu then a specific test-id item. */
export async function clickContextMenuItem(page: Page, testId: string) {
  await page.getByTestId('contextMenuButton').click();
  await page.getByTestId(testId).click();
}
