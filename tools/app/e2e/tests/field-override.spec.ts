import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

test.describe.configure({ mode: 'serial' });

// The "All data types" template card ships in module-test with the
// test/cardTypes/allDataTypes card type. Its calculation defines
// test/fieldTypes/aPlusB as a calculated field (a + b) with enableOverride.
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

/** Enter inline edit for an integer field, type a value and save. */
async function fillIntegerField(page: Page, fieldName: string, value: string) {
  const row = fieldRow(page, fieldName);
  await row.getByTestId('editableFieldRow').click();
  await row.getByRole('spinbutton').fill(value);
  await row.getByTestId('fieldSaveButton').click();
  // The editor unmounts only after the save round-trip succeeds.
  await expect(row.getByRole('spinbutton')).toHaveCount(0);
}

test.describe('Calculated field override', () => {
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

  test('shows the automatic value of an overridable calculated field', async ({
    page,
  }) => {
    // Create a project card from the "All data types" template.
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

    // Navigate to the created card through the tree instead of relying on the
    // post-create navigation.
    await openCard(page, cardTitle);

    await fillIntegerField(page, 'test/fieldTypes/a', '2');
    await fillIntegerField(page, 'test/fieldTypes/b', '3');

    // The overridable row shows the computed value and an empty override.
    const row = fieldRow(page, 'test/fieldTypes/aPlusB');
    await expect(row.getByTestId('automaticValue')).toHaveText(
      `${t.automaticValue}: 5`,
    );
    await expect(row.getByTestId('overrideValue')).toHaveText(`${t.override}:`);
  });

  test('saves an override value', async ({ page }) => {
    await openCard(page, cardTitle);

    const row = fieldRow(page, 'test/fieldTypes/aPlusB');
    await row.getByTestId('editableFieldRow').click();

    // No override stored and nothing typed yet: Clear is disabled.
    await expect(row.getByTestId('fieldClearOverrideButton')).toBeDisabled();
    // The automatic value stays visible while editing.
    await expect(row.getByTestId('automaticValue')).toHaveText(
      `${t.automaticValue}: 5`,
    );

    await row.getByRole('spinbutton').fill('42');
    await row.getByTestId('fieldSaveButton').click();
    await expect(row.getByRole('spinbutton')).toHaveCount(0);

    await expect(row.getByTestId('automaticValue')).toHaveText(
      `${t.automaticValue}: 5`,
    );
    await expect(row.getByTestId('overrideValue')).toHaveText(
      `${t.override}: 42`,
    );
  });

  test('clears a stored override', async ({ page }) => {
    await openCard(page, cardTitle);

    // The override persisted across the page load.
    const row = fieldRow(page, 'test/fieldTypes/aPlusB');
    await expect(row.getByTestId('overrideValue')).toHaveText(
      `${t.override}: 42`,
    );

    await row.getByTestId('editableFieldRow').click();
    const clearButton = row.getByTestId('fieldClearOverrideButton');
    await expect(clearButton).toBeEnabled();
    await clearButton.click();
    await expect(row.getByRole('spinbutton')).toHaveCount(0);

    // The override is gone and the automatic value still shows.
    await expect(row.getByTestId('overrideValue')).toHaveText(`${t.override}:`);
    await expect(row.getByTestId('automaticValue')).toHaveText(
      `${t.automaticValue}: 5`,
    );
  });
});
