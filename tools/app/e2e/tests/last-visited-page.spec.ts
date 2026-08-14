import { test as base, expect } from '../fixtures.js';

base.describe('Remember last visited page per project', () => {
  base.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  base(
    'reopening the app returns to the last visited card, not the card list',
    async ({ page }) => {
      await page.goto('/');
      await expect(page).toHaveURL(/\/projects\/.+\/cards$/);

      await page.getByTestId('createNewButton').click();
      await page
        .locator('.templateCard')
        .filter({ hasText: 'Page' })
        .first()
        .click();
      await page.getByTestId('confirmCreateButton').click();
      await expect(
        page
          .getByRole('presentation')
          .filter({ hasText: 'Card created successfully' }),
      ).toBeVisible();
      await page.getByTestId('notificationClose').first().click();

      await expect(page).toHaveURL(/\/cards\/[\w-]+$/);
      const cardUrl = page.url();
      const cardKey = cardUrl.split('/cards/')[1]!;

      // Wait for redux-persist to flush the new lastPathByPrefix entry to
      // localStorage before simulating "reopening the app" with a full
      // navigation (a real page.goto tears down and rehydrates the store,
      // unlike an in-app client-side navigation).
      await page.waitForFunction((key) => {
        const raw = localStorage.getItem('persist:root');
        return !!raw && raw.includes(key);
      }, cardKey);

      await page.goto('/');
      await expect(page).toHaveURL(cardUrl);
    },
  );

  base(
    'a stored path to a deleted card degrades gracefully instead of a hard 404',
    async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('createNewButton').click();
      await page
        .locator('.templateCard')
        .filter({ hasText: 'Page' })
        .first()
        .click();
      await page.getByTestId('confirmCreateButton').click();
      await expect(
        page
          .getByRole('presentation')
          .filter({ hasText: 'Card created successfully' }),
      ).toBeVisible();
      await page.getByTestId('notificationClose').first().click();

      // NewCardModal dispatches the success toast before it routes to the new
      // card, so the toast being visible does not imply the URL has settled.
      await expect(page).toHaveURL(/\/cards\/[\w-]+$/);
      const cardUrl = page.url();
      const cardKey = cardUrl.split('/cards/')[1]!;
      await page.waitForFunction((key) => {
        const raw = localStorage.getItem('persist:root');
        return !!raw && raw.includes(key);
      }, cardKey);

      await page.getByTestId('contextMenuButton').click();
      // A card still in `recentlyCreated` deletes without the confirm modal,
      // so there is no confirmDeleteButton to click here.
      await page.getByTestId('deleteCardButton').click();
      await expect(
        page.getByRole('presentation').filter({ hasText: 'deleted' }),
      ).toBeVisible();

      // NOTE: after the delete, the app itself navigates to the card list
      // (CardToolbar's afterDelete), and the layout.tsx last-path recorder immediately
      // overwrites lastPathByPrefix with '/cards' — so `page.goto('/')`
      // here would replay '/cards' and prove nothing about staleness.
      // Instead, replay the stale card URL directly with a full page load:
      // this is exactly the URL shape a stale lastPathByPrefix entry would
      // produce (deriveLastPath only ever stores /cards... shapes), and it
      // must degrade to card-view's inline error, not the hard 404 page.
      await page.goto(cardUrl);
      await expect(page).toHaveURL(cardUrl);
      await expect(page.getByTestId('createNewButton')).toBeVisible();
      await expect(page.getByText('Page not found')).toHaveCount(0);

      // Landing on a dead card must also un-remember it, or every reopen
      // replays the same error. Wait for that reset to reach localStorage.
      await page.waitForFunction((key) => {
        const raw = localStorage.getItem('persist:root');
        if (!raw) return false;
        const project = JSON.parse(JSON.parse(raw).project ?? '{}');
        return !Object.values(
          (project.lastPathByPrefix ?? {}) as Record<string, string>,
        ).some((path) => path.includes(key));
      }, cardKey);

      await page.goto('/');
      await expect(page).toHaveURL(/\/projects\/.+\/cards$/);
    },
  );
});
