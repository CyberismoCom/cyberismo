import { test, expect } from '../fixtures.js';
import type { Page } from '@playwright/test';
import { editPage, dismissSaveToast, typeIntoCodeMirror } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

test.describe.configure({ mode: 'serial' });

// Macro typing sequences (translated from Cypress DSL).
// Cypress `{{}` escapes a literal `{`; in Playwright we just type `{` directly.
// `{rightArrow}` → `{ press: 'ArrowRight' }`. `{moveToEnd}` → `{ press: 'End' }`.

const percentageMacro: Array<string | { press: string }> = [
  '{{#percentage',
  { press: 'End' },
  '"title": "Work done","value": 2,"legend": "of Assets","colour": "blue"',
  '{{/percentage',
  { press: 'End' },
];

const scoreCardMacro: Array<string | { press: string }> = [
  '{{#scoreCard',
  { press: 'End' },
  '"title": "Security control adoption","value": 30,"unit": "%","legend": "In progress"',
  '{{/scoreCard',
  { press: 'End' },
];

const vegaLiteMacro: Array<string | { press: string }> = [
  '{{#vegaLite',
  { press: 'End' },
  '"spec":{"$schema": "https://vega.github.io/schema/vega-lite/v6.json","description": "A simple pie chart with embedded data.","data": {"values": [{"category": 1, "value": 4',
  { press: 'ArrowRight' },
  ',{"category": 2, "value": 6',
  { press: 'ArrowRight' },
  ',{"category": 3, "value": 10',
  { press: 'ArrowRight' },
  ',{"category": 4, "value": 3',
  { press: 'ArrowRight' },
  ',{"category": 5, "value": 7',
  { press: 'ArrowRight' },
  ',{"category": 6, "value": 8',
  { press: 'ArrowRight' },
  ']',
  { press: 'ArrowRight' },
  ',"mark": "arc","encoding": {"theta": {"field": "value", "type": "quantitative"',
  { press: 'ArrowRight' },
  ',"color": {"field": "category", "type": "nominal"',
  { press: 'ArrowRight' },
  { press: 'ArrowRight' },
  { press: 'ArrowRight' },
  '{{/vegaLite',
  { press: 'End' },
];

const openMacroMenu = (page: Page) =>
  page.locator('[aria-haspopup="menu"]').last().click();
const selectMacro = (page: Page, name: string) =>
  page.getByRole('menuitem', { name }).click();
const selectDropdownMenuOption = (page: Page, option: string, exact = false) =>
  page
    .getByRole('listbox')
    .getByRole('option', { name: option, exact })
    .click();

/** Click the Template combobox button inside a dialog to open its dropdown. */
const openTemplateDropdown = (page: Page) =>
  page.getByRole('dialog').getByRole('combobox', { name: 'Template' }).click();

test.describe('Navigation', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('Create cards macro', async ({ page }) => {
    await page.getByTestId('createNewButton').click();
    await page
      .locator('.templateCard')
      .filter({ hasText: 'Page' })
      .first()
      .click();
    await page.getByTestId('confirmCreateButton').click();

    const createToast = page
      .getByRole('presentation')
      .filter({ hasText: t.createCardModal.success });
    await expect(createToast).toBeVisible();
    await createToast.getByTestId('notificationClose').click();
    await expect(createToast).toHaveCount(0);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    // Rename the page via CardTitle inline edit
    await page.getByTestId('cardTitle').click();
    await page.getByTestId('cardTitleInput').fill('Create cards page');
    await page.getByTestId('cardTitleSaveButton').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    // Edit page content inline
    await editPage(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');

    // Add "Create cards" macro for "All data types"
    await openMacroMenu(page);
    await selectMacro(page, 'Create cards');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').filter({ hasText: 'Create cards' }),
    ).toBeVisible();
    await openTemplateDropdown(page);
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'All data types' })
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .fill('Test Create All data types page');
    await page.getByRole('dialog').getByText('Insert macro').click();

    // Add "Create cards" macro for "Policy checks and notifications"
    await openMacroMenu(page);
    await selectMacro(page, 'Create cards');
    await openTemplateDropdown(page);
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'Policy checks and notifications' })
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .fill('Create Policy checks and notifications page');
    await page.getByRole('dialog').getByText('Insert macro').click();

    // Add "Create cards" macro for "Test denied operations"
    await openMacroMenu(page);
    await selectMacro(page, 'Create cards');
    await openTemplateDropdown(page);
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'Test denied operations' })
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .fill('Create Test denied operations page');
    await page.getByRole('dialog').getByText('Insert macro').click();

    // Add "Create cards" macro for "Page"
    await openMacroMenu(page);
    await selectMacro(page, 'Create cards');
    await openTemplateDropdown(page);
    await selectDropdownMenuOption(page, 'Page', true);
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .fill('Create empty page');
    await page.getByRole('dialog').getByText('Insert macro').click();

    // Add "Create cards" macro for "Page content"
    await openMacroMenu(page);
    await selectMacro(page, 'Create cards');
    await openTemplateDropdown(page);
    await selectDropdownMenuOption(page, 'Page content', true);
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .click();
    await page
      .getByRole('dialog')
      .getByPlaceholder('Enter button text')
      .fill('Create page content');
    await page.getByRole('dialog').getByText('Insert macro').click();

    // Save
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    // Verify macro — click "Test Create All data types page" button
    await page
      .locator('.doc')
      .locator('[type="button"]', {
        hasText: 'Test Create All data types page',
      })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();
    await page.getByTestId('notificationClose').first().click();
    await expect(
      page
        .getByRole('presentation')
        .filter({ hasText: 'Card created successfully' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^Test all data types of custom fields$/,
      }),
    ).toBeVisible();
  });

  test('Graph macro', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await page
      .locator('.doc')
      .locator('[type="button"]', {
        hasText: 'Create Policy checks and notifications page',
      })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();
    await page.getByTestId('notificationClose').first().click();
    await expect(
      page
        .getByRole('presentation')
        .filter({ hasText: 'Card created successfully' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^Test notifications and policy checks$/,
      }),
    ).toBeVisible();

    await editPage(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');

    // Add Graph macro from toolbar
    await openMacroMenu(page);
    await selectMacro(page, 'Graph');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').filter({ hasText: 'Graph' }),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Graph model' })
      .click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'bat/graphModels/test1' })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Graph view' })
      .click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'bat/graphViews/test1' })
      .click();
    await page.getByRole('dialog').getByText('Insert macro').click();

    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(
      page.locator('.doc .cyberismo-svg-wrapper [aria-label="fullscreen"]'),
    ).toBeVisible();
    await expect(
      page.locator('.doc .cyberismo-svg-wrapper [aria-label="download"]'),
    ).toBeVisible();
    await expect(
      page.locator('.doc .cyberismo-svg-wrapper').filter({
        hasText: 'Test notifications and policy checks',
      }),
    ).toBeVisible();
  });

  test('Image macro', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    const cardKey = page.url().split('/cards/')[1];

    await page.getByTestId('contextMenuButton').click();
    await page.getByTestId('addAttachmentButton').click();

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

    await page
      .getByTestId('fileUploadButton')
      .locator('input[type="file"]')
      .setInputFiles('./e2e/assets/cyberismo.png');
    await page.getByRole('dialog').getByRole('button', { name: t.add }).click();

    const attachToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Attachment(s) added successfully' });
    await expect(attachToast).toBeVisible();
    // Dismiss attachment toast before proceeding so it doesn't collide with save toast
    await attachToast.getByTestId('notificationClose').click();
    await expect(attachToast).toHaveCount(0);

    // Hover over attachment and insert to content
    await page.locator('span', { hasText: 'cyberismo.png' }).hover();
    await page.getByTestId('insertToContentButton').click();
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    // Create card for image macro using "Create Test denied operations page" button
    await page
      .locator('.doc')
      .locator('[type="button"]', {
        hasText: 'Create Test denied operations page',
      })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();

    await expect(
      page.getByRole('heading', { level: 1, name: /^Test denied operations$/ }),
    ).toBeVisible();

    await editPage(page);

    await typeIntoCodeMirror(page, [
      `{{#image`,
      { press: 'End' },
      `"fileName": "cyberismo.png","cardKey": "${cardKey}"`,
      `{{/image`,
      { press: 'End' },
    ]);

    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(page.locator('.doc img[alt="cyberismo"]')).toBeVisible();
  });

  test('Include macro', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    const cardKey = page.url().split('/cards/')[1];

    await page
      .locator('.doc')
      .locator('[type="button"]', { hasText: 'Create empty page' })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    // First include macro: Include title = Include, Page titles = Normal
    await editPage(page);
    await openMacroMenu(page);
    await selectMacro(page, 'Include a card');

    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').filter({ hasText: 'Include a card' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('label', { hasText: 'Card' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('label', { hasText: 'Level offset' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('label', { hasText: 'Include title' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('label', { hasText: 'Page titles' }),
    ).toBeVisible();

    await page.getByPlaceholder('Select a card').click();
    await page
      .getByRole('listbox')
      .getByRole('option', {
        name: new RegExp(`Create cards page \\(${cardKey}\\)`),
      })
      .click();

    // Hover over the label SVG to verify tooltip
    await page.getByRole('dialog').locator('label svg').hover();
    await expect(
      page.getByRole('tooltip').filter({
        hasText:
          'An optional offset to adjust the heading levels of the included content. For example ',
      }),
    ).toBeVisible();

    await page.getByPlaceholder('+1').click();
    await page.getByPlaceholder('+1').fill('1');

    await page
      .getByRole('dialog')
      .locator('label', { hasText: 'Include title' })
      .click();
    await selectDropdownMenuOption(page, 'Include');

    await page
      .getByRole('dialog')
      .locator('label', { hasText: 'Page titles' })
      .click();
    await selectDropdownMenuOption(page, 'Normal');

    await page.getByRole('dialog').getByText('Insert macro').click();
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    // Verify included card content
    await expect(
      page.getByRole('heading', { level: 2, name: /^Create cards page$/ }),
    ).toBeVisible();
    await expect(
      page.locator('.doc [type="button"]', { hasText: 'Create empty page' }),
    ).toBeVisible();
    await expect(
      page.locator('.doc [type="button"]', {
        hasText: 'Create Test denied operations page',
      }),
    ).toBeVisible();
    await expect(
      page.locator('.doc [type="button"]', {
        hasText: 'Create Policy checks and notifications page',
      }),
    ).toBeVisible();
    await expect(
      page.locator('.doc [type="button"]', {
        hasText: 'Test Create All data types page',
      }),
    ).toBeVisible();
    await expect(
      page.locator('.doc [type="button"]', { hasText: 'Create page content' }),
    ).toBeVisible();

    // Second include macro: Include title = Only, Page titles = Discrete
    await editPage(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');

    await openMacroMenu(page);
    await selectMacro(page, 'Include a card');
    await page.getByPlaceholder('Select a card').click();
    await page
      .getByRole('listbox')
      .getByRole('option', {
        name: new RegExp(`Create cards page \\(${cardKey}\\)`),
      })
      .click();
    await page.getByPlaceholder('+1').click();
    await page.getByPlaceholder('+1').fill('2');
    await page
      .getByRole('dialog')
      .locator('label', { hasText: 'Include title' })
      .click();
    await selectDropdownMenuOption(page, 'Only');
    await page
      .getByRole('dialog')
      .locator('label', { hasText: 'Page titles' })
      .click();
    await selectDropdownMenuOption(page, 'Discrete');
    await page.getByRole('dialog').getByText('Insert macro').click();
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    // Verify discrete heading and no create buttons
    await expect(
      page.locator('h3.discrete', { hasText: 'Create cards page' }),
    ).toBeVisible();
    await expect(
      page.locator('.doc [type="button"]', { hasText: 'Create empty page' }),
    ).toHaveCount(0);

    // Third include macro: Include title = Exclude
    await editPage(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');

    await openMacroMenu(page);
    await selectMacro(page, 'Include a card');
    await page.getByPlaceholder('Select a card').click();
    await page
      .getByRole('listbox')
      .getByRole('option', {
        name: new RegExp(`Create cards page \\(${cardKey}\\)`),
      })
      .click();
    await page.getByPlaceholder('+1').click();
    await page.getByPlaceholder('+1').fill('2');
    await page
      .getByRole('dialog')
      .locator('label', { hasText: 'Include title' })
      .click();
    await selectDropdownMenuOption(page, 'Exclude');
    await page.getByRole('dialog').getByText('Insert macro').click();
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    // Verify no headings, but create buttons are present
    await expect(page.locator('h3')).toHaveCount(0);
    await expect(
      page.locator('.doc [type="button"]', { hasText: 'Create empty page' }),
    ).toBeVisible();
  });

  test('Percentage macro', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    await page
      .locator('.doc')
      .locator('[type="button"]', { hasText: 'Create page content' })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();
    await page.getByTestId('notificationClose').first().click();
    await expect(
      page
        .getByRole('presentation')
        .filter({ hasText: 'Card created successfully' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();

    await editPage(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await typeIntoCodeMirror(page, percentageMacro);

    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(
      page.locator('.doc svg', { hasText: 'Work done' }),
    ).toBeVisible();
    await expect(page.locator('.doc svg', { hasText: '2%' })).toBeVisible();
    await expect(
      page.locator('.doc svg', { hasText: 'of Assets' }),
    ).toBeVisible();
    await expect(page.locator('.doc svg [stroke="blue"]')).toBeVisible();
  });

  test('Report macro', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    await page
      .locator('.doc')
      .locator('[type="button"]', { hasText: 'Create empty page' })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();
    await page.getByTestId('notificationClose').first().click();
    await expect(
      page
        .getByRole('presentation')
        .filter({ hasText: 'Card created successfully' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await editPage(page);
    await openMacroMenu(page);
    await selectMacro(page, 'Report');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('combobox', { name: 'Report' })
      .click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'bat/reports/test1' })
      .click();
    await page.getByRole('dialog').getByText('Insert macro').click();

    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(
      page.locator('.doc .paragraph', { hasText: '* * * *' }),
    ).toBeVisible();
  });

  test('Score card macro', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    await page
      .locator('.doc')
      .locator('[type="button"]', { hasText: 'Create empty page' })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();
    await page.getByTestId('notificationClose').first().click();
    await expect(
      page
        .getByRole('presentation')
        .filter({ hasText: 'Card created successfully' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await editPage(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await typeIntoCodeMirror(page, scoreCardMacro);

    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(
      page.locator('.doc .card', { hasText: 'Security control adoption' }),
    ).toBeVisible();
    await expect(
      page
        .locator('.doc .card')
        .filter({ hasText: '30' })
        .filter({ hasText: '%' }),
    ).toBeVisible();
    await expect(
      page.locator('.doc .card', { hasText: 'In progress' }),
    ).toBeVisible();
  });

  test('Vega-Lite and Vega macros', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    await page
      .locator('.doc')
      .locator('[type="button"]', { hasText: 'Create empty page' })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();
    await page.getByTestId('notificationClose').first().click();
    await expect(
      page
        .getByRole('presentation')
        .filter({ hasText: 'Card created successfully' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await editPage(page);
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await typeIntoCodeMirror(page, vegaLiteMacro);

    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(page.locator('.doc .vega-embed')).toBeVisible();
  });

  test('Xref macro', async ({ page }) => {
    await page.getByRole('tree').getByText('Create cards page').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Create cards page$/ }),
    ).toBeVisible();

    const cardKey = page.url().split('/cards/')[1];

    await page
      .locator('.doc')
      .locator('[type="button"]', { hasText: 'Create empty page' })
      .click();

    const cardCreatedToast = page
      .getByRole('presentation')
      .filter({ hasText: 'Card created successfully' });
    await expect(cardCreatedToast).toBeVisible();
    await page.getByTestId('notificationClose').first().click();
    await expect(
      page
        .getByRole('presentation')
        .filter({ hasText: 'Card created successfully' }),
    ).toHaveCount(0);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await editPage(page);
    await openMacroMenu(page);
    await selectMacro(page, 'Cross reference');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').locator('label', { hasText: 'Card' }),
    ).toBeVisible();

    await page.getByPlaceholder('Select a card').click();
    await page
      .getByRole('listbox')
      .getByRole('option', {
        name: new RegExp(`Create cards page \\(${cardKey}\\)`),
      })
      .click();
    await page.getByRole('dialog').getByText('Insert macro').click();

    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(
      page.locator(`.doc [href="/cards/${cardKey}"]`, {
        hasText: 'Create cards page',
      }),
    ).toBeVisible();
  });
});
