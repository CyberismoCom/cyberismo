import { test, expect } from '../fixtures.js';

// TEMPORARY — intentional failure to verify the CI failure path:
//   * `github` reporter  -> inline annotation on the run/PR
//   * `html` reporter     -> playwright-report/ uploaded as an artifact
//   * trace/screenshot/video are captured (on-first-retry / on failure)
// Remove this file once the CI artifact upload has been confirmed.
test('CI artifact smoke check — intentional failure (remove me)', async ({
  page,
}) => {
  await page.goto('/');
  // Deliberately wrong expectation so the run fails fast but still
  // captures a screenshot/trace/video of the real app at failure time.
  await expect(page).toHaveTitle('THIS TITLE DOES NOT EXIST', {
    timeout: 3000,
  });
});
