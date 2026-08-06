import { test, expect } from '../fixtures.js';
import { createPage, editPage, typeIntoCodeMirror } from '../helpers.js';

test.describe.configure({ mode: 'serial' });

test.describe('Card body scrolling while editing', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('a long card body scrolls in a single container, and Save stays reachable', async ({
    page,
  }) => {
    await createPage(page);
    await editPage(page);

    const longContent = Array.from(
      { length: 200 },
      (_, i) => `Line ${i} of the body.`,
    ).join('\n');
    await typeIntoCodeMirror(page, [longContent]);

    // CodeMirror's own scroller must not need to scroll internally — it
    // should grow to fit its content, exactly like the (known-good)
    // template-card ContentEditor.
    const cmScrollerOverflows = await page
      .locator('.cm-scroller')
      .evaluate((el) => el.scrollHeight > el.clientHeight + 2);
    expect(cmScrollerOverflows).toBe(false);

    // The single outer container does scroll, and scrolling it all the
    // way down still leaves the (sticky) Save button visible.
    const outer = page.getByTestId('cardContentScroll');
    await outer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await expect(page.getByTestId('contentSaveButton')).toBeVisible();
  });
});
