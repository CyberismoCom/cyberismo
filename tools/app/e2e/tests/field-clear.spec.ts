// SPDX-FileCopyrightText: Cyberismo Ltd and contributors
// SPDX-License-Identifier: AGPL-3.0-only

import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

test.describe.configure({ mode: 'serial' });

// The "All data types" template card ships in module-test with the
// test/cardTypes/allDataTypes card type, which has one field of each type.
const cardTitle = 'Test all data types of custom fields';

const fieldRow = (page: Page, fieldName: string) =>
  page.locator(`[id="metadata-field-${fieldName}"]`);

/** Open a card from the tree menu by its title. */
async function openCard(page: Page, title: string) {
  await page.locator('[role="tree"] p').filter({ hasText: title }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: new RegExp(`^${title}$`) }),
  ).toBeVisible();
}

test.describe('Clear button of a field', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
    // Wait for the landing card to render so the initial client-side redirect
    // cannot override a later in-test navigation.
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();
  });

  test('creates a card with all data types', async ({ page }) => {
    await page.getByTestId('createNewButton').click();
    await page
      .locator('.templateCard')
      .filter({ hasText: 'All data types' })
      .click();
    await page.getByTestId('confirmCreateButton').click();

    const createToast = page
      .getByRole('presentation')
      .filter({ hasText: t.createCardModal.success });
    await expect(createToast).toBeVisible();
    await createToast.getByTestId('notificationClose').click();
    await expect(createToast).toHaveCount(0);
  });

  test('clears an enum field without opening its options', async ({ page }) => {
    await openCard(page, cardTitle);
    const row = fieldRow(page, 'test/fieldTypes/enum');

    // Choosing an option saves it when the options list closes.
    await row.getByTestId('editableFieldRow').click();
    await expect(row.getByRole('button', { name: t.clear })).toHaveCount(0);
    await row.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Option 2' }).click();
    await expect(row.getByRole('combobox')).toHaveCount(0);
    await expect(row).toContainText('Option 2');

    await row.getByTestId('editableFieldRow').click();
    await row.getByRole('button', { name: t.clear }).click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    // The cleared value is saved at once, which closes the editor.
    await expect(row.getByRole('combobox')).toHaveCount(0);
    await expect(row).not.toContainText('Option 2');

    await page.reload();
    await expect(fieldRow(page, 'test/fieldTypes/enum')).not.toContainText(
      'Option 2',
    );
  });

  test('clears a date field that has an unsaved edit', async ({ page }) => {
    await openCard(page, cardTitle);
    const row = fieldRow(page, 'test/fieldTypes/date');
    const input = row.locator('input[type="date"]');

    await row.getByTestId('editableFieldRow').click();
    await input.fill('2026-11-24');
    await row.getByTestId('fieldSaveButton').click();
    await expect(input).toHaveCount(0);
    await expect(row).toContainText('2026-11-24');

    // An unsaved edit must not be saved by the blur of the Clear click.
    await row.getByTestId('editableFieldRow').click();
    await input.fill('2026-12-31');
    await row.getByRole('button', { name: t.clear }).click();
    await expect(input).toHaveCount(0);
    await expect(row).not.toContainText('2026-11-24');
    await expect(row).not.toContainText('2026-12-31');

    await page.reload();
    const reloaded = fieldRow(page, 'test/fieldTypes/date');
    await expect(reloaded).not.toContainText('2026-11-24');
    await expect(reloaded).not.toContainText('2026-12-31');
  });
});
