import { test, expect } from '../fixtures.js';
import { editPage, createPage, dismissSaveToast } from '../helpers.js';

test.describe('Native AsciiDoc xref', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('renders xref:KEY.adoc[label] as a multi-project link and navigates to the target', async ({
    page,
  }) => {
    const prefixMatch = page.url().match(/\/projects\/([^/]+)/);
    if (!prefixMatch) {
      throw new Error(`expected /projects/<prefix> in URL: ${page.url()}`);
    }
    const prefix = prefixMatch[1];

    // Create card A and capture its key.
    await createPage(page);
    const aKey = page.url().split('/cards/')[1];
    expect(aKey, 'card A key').toMatch(/.+_.+/);

    // Create card B and capture its key.
    await page.goto('/');
    await createPage(page);
    const bKey = page.url().split('/cards/')[1];
    expect(bKey, 'card B key').toMatch(/.+_.+/);

    // Navigate back to card A and edit its body to contain a native xref.
    await page.goto(`/projects/${prefix}/cards/${aKey}`);
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await editPage(page);

    // Clear the editor's current line and type the xref.
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(`See xref:${bKey}.adoc[Go to B] please.`);
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    // Assert the rendered HTML contains a link with the canonical multi-project href.
    const expectedHref = `/projects/${prefix}/cards/${bKey}`;
    const link = page.locator('.doc a[href]').first();
    await expect(link).toHaveAttribute('href', expectedHref);
    await expect(link).toHaveText('Go to B');

    // Click the link and confirm SPA navigation to card B.
    await page.locator('.doc').getByRole('link', { name: 'Go to B' }).click();
    await expect(page).toHaveURL(
      new RegExp(expectedHref.replace(/\//g, '\\/')),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();
  });
});
