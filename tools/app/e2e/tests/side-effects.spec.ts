import { test, expect } from '../fixtures.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

test.describe('Transition side effects', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('approving a card cascades the transition to its descendants', async ({
    page,
  }) => {
    // Create the three-level demo tree from the module's template.
    await page.getByTestId('createNewButton').click();
    await page
      .locator('.templateCard')
      .filter({ hasText: 'Test transition side effects' })
      .click();
    await page.getByTestId('confirmCreateButton').click();

    const createToast = page
      .getByRole('presentation')
      .filter({ hasText: t.createCardModal.success });
    await expect(createToast).toBeVisible();
    await createToast.getByTestId('notificationClose').click();
    await expect(createToast).toHaveCount(0);

    // Approve the parent card.
    await page.locator('p').filter({ hasText: 'Side effects parent' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Side effects parent' }),
    ).toBeVisible();
    await page
      .getByTestId('stateSelectorButton')
      .filter({ hasText: 'Draft' })
      .click();
    await page.getByRole('menu').getByText('Approve', { exact: true }).click();
    await expect(
      page.getByTestId('stateSelectorButton').filter({ hasText: 'Approved' }),
    ).toBeVisible();

    // The child and grandchild were approved as side effects of the same
    // transition — no further user action.
    for (const title of ['Side effects child', 'Side effects grandchild']) {
      await page.locator('p').filter({ hasText: title }).click();
      await expect(
        page.getByRole('heading', { level: 1, name: title }),
      ).toBeVisible();
      await expect(
        page.getByTestId('stateSelectorButton').filter({ hasText: 'Approved' }),
      ).toBeVisible();
    }
  });
});
