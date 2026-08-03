import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  test('shows the calculated value of an overridable field with no override', async ({
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

    // With no override stored, the row reads like any other field: just the
    // computed value, no automatic/override breakdown.
    const row = fieldRow(page, 'test/fieldTypes/aPlusB');
    await expect(row.getByTestId('editableFieldRow')).toContainText('5');
    await expect(row.getByTestId('automaticValue')).toHaveCount(0);
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

    // Back in read mode the override is the value shown, on its own.
    await expect(row.getByTestId('editableFieldRow')).toContainText('42');
    await expect(row.getByTestId('automaticValue')).toHaveCount(0);
  });

  test('clears a stored override', async ({ page }) => {
    await openCard(page, cardTitle);

    // The override persisted across the page load.
    const row = fieldRow(page, 'test/fieldTypes/aPlusB');
    await expect(row.getByTestId('editableFieldRow')).toContainText('42');

    await row.getByTestId('editableFieldRow').click();
    // The stored override prefills the editor.
    await expect(row.getByRole('spinbutton')).toHaveValue('42');
    const clearButton = row.getByTestId('fieldClearOverrideButton');
    await expect(clearButton).toBeEnabled();
    await clearButton.click();
    await expect(row.getByRole('spinbutton')).toHaveCount(0);

    // The override is gone, so the row falls back to the computed value.
    await expect(row.getByTestId('editableFieldRow')).toContainText('5');
  });
});

// A template card carries an override the same way a project card does. It has
// no calculated value of its own, so the automatic value is described rather
// than shown, and the framing stays visible because the editor is edit-first.
test.describe('Calculated field override on a template card', () => {
  const { localTemplateCardKey } = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', 'assets', 'e2e-keys.json'),
      'utf8',
    ),
  ) as { localTemplateCardKey: string };

  const overrideRow = (page: Page) =>
    page
      .getByTestId('metadataView')
      .locator('[id="metadata-field-test/fieldTypes/aPlusB"]');

  async function openTemplateCard(page: Page) {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
    const projectPrefix = page.url().split('/projects/')[1].split('/')[0];
    await page.goto(
      `/configuration/${projectPrefix}/cards/${localTemplateCardKey}`,
    );
    await expect(page.getByTestId('metadataView')).toBeVisible();
  }

  test('sets and clears an override on a template card', async ({ page }) => {
    await openTemplateCard(page);
    const row = overrideRow(page);

    await expect(row.getByTestId('automaticValue')).toHaveText(
      `${t.automaticValue}: ${t.calculatedForEachCard}`,
    );
    // Nothing stored yet.
    await expect(row.getByTestId('fieldClearOverrideButton')).toBeDisabled();

    await row.getByRole('spinbutton').fill('42');
    await row.getByTestId('fieldSaveButton').click();
    await expect(row.getByTestId('fieldSaveButton')).toBeDisabled();

    // The override persists across a reload of the editor.
    await openTemplateCard(page);
    await expect(overrideRow(page).getByRole('spinbutton')).toHaveValue('42');

    const clear = overrideRow(page).getByTestId('fieldClearOverrideButton');
    await expect(clear).toBeEnabled();
    await clear.click();
    await expect(overrideRow(page).getByRole('spinbutton')).toHaveValue('');
  });
});
