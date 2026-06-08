import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '../fixtures.js';
import { editPage, dismissSaveToast } from '../helpers.js';
import t from '../../src/locales/en/translation.json' with { type: 'json' };

test.describe.configure({ mode: 'serial' });

test.describe('Navigation', () => {
  test.beforeAll(async ({ resetProject }) => {
    await resetProject();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects\//);
  });

  test('delete page and verify empty project', async ({ page }) => {
    await expect(
      page.locator('h4', { hasText: 'Basic Acceptance Test' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: /Untitled page/ }),
    ).toBeVisible();

    await page.getByTestId('contextMenuButton').click();
    await page.getByTestId('deleteCardButton').click();
    await page.getByTestId('confirmDeleteButton').click();

    const deleteToast = page
      .getByRole('presentation')
      .filter({ hasText: t.deleteCardSuccess });
    await expect(deleteToast).toBeVisible();
    await deleteToast.getByTestId('notificationClose').click();
    await expect(deleteToast).toHaveCount(0);

    await expect(page.locator('p', { hasText: t.emptyProject })).toBeVisible();
  });

  test('Create a page', async ({ page }) => {
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
      page.locator('p', { hasText: 'Untitled page' }).first(),
    ).toBeVisible();
    await expect(page.getByTestId('linkIconButton')).toBeDisabled();
  });

  test('Create a page content as a child of the page', async ({ page }) => {
    await page.getByTestId('createNewButton').click();
    await page
      .locator('.templateCard')
      .filter({ hasText: 'Page content' })
      .click();
    await page
      .getByRole('dialog')
      .getByText(t.createOnTopLevel)
      .click({ force: true });
    await page.getByTestId('confirmCreateButton').click();

    const createToast = page
      .getByRole('presentation')
      .filter({ hasText: t.createCardModal.success });
    await expect(createToast).toBeVisible();
    await createToast.getByTestId('notificationClose').click();
    await expect(createToast).toHaveCount(0);

    await expect(
      page.locator('p', { hasText: 'Untitled page content' }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Context' }),
    ).toBeVisible();
    await expect(
      page.locator('p', {
        hasText:
          'Describe background information. What is motivating this decision. Which options were considered.',
      }),
    ).toBeVisible();
    await expect(page.getByTestId('linkIconButton')).toBeEnabled();

    await expect(
      page.getByRole('heading', { level: 2, name: 'Decision' }),
    ).toBeVisible();
    await expect(
      page.locator('p', {
        hasText: 'Describe the change that we’re proposing or doing.',
      }),
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { level: 2, name: 'Consequences' }),
    ).toBeVisible();
    await expect(
      page.locator('p', {
        hasText:
          'Describe the benefits and drawbacks of the decision. Describe what happens next.',
      }),
    ).toBeVisible();

    await expect(
      page.locator('.toc-menu > p', { hasText: 'Table of contents' }),
    ).toBeVisible();
    await expect(
      page.locator('.toc-menu a', { hasText: 'Context' }),
    ).toBeVisible();
    await expect(
      page.locator('.toc-menu a', { hasText: 'Decision' }),
    ).toBeVisible();
    await expect(
      page.locator('.toc-menu a', { hasText: 'Consequences' }),
    ).toBeVisible();
  });

  test('moves card with move function', async ({ page }) => {
    await page
      .locator('p')
      .filter({ hasText: 'Untitled page content' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();

    await expect(page.locator('[role="tree"] [aria-level="2"]')).toHaveCount(0);
    // Neither top-level treeitem should have an expand icon visible (no children yet)
    const expandIcons = page
      .locator('[role="tree"] [aria-level="1"]')
      .getByTestId('ExpandMoreIcon');
    const count = await expandIcons.count();
    for (let i = 0; i < count; i++) {
      await expect(expandIcons.nth(i)).not.toBeVisible();
    }

    await page.getByTestId('contextMenuButton').click();
    await page.locator('[id="moveCardButton"]').click();

    await page.getByRole('dialog').getByText(t.all, { exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('treeitem')
      .filter({ hasText: t.moveCardModal.projectTopLevel })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('treeitem')
      .filter({ hasText: 'Untitled page' })
      .click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: t.cancel }),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t.moveCardModal.title })
      .click();

    const moveToast = page
      .getByRole('presentation')
      .filter({ hasText: t.moveCardModal.success });
    await expect(moveToast).toBeVisible();
    await moveToast.getByTestId('notificationClose').click();
    await expect(moveToast).toHaveCount(0);

    // "Untitled page" should now have a visible expand icon (it has a child card)
    await expect(
      page
        .getByRole('treeitem', { name: 'Untitled page', exact: true })
        .getByTestId('ExpandMoreIcon'),
    ).toBeVisible();
  });

  test('inline edit card title', async ({ page }) => {
    await page
      .locator('p')
      .filter({ hasText: /^Untitled page$/ })
      .click();
    await page
      .locator('p')
      .filter({ hasText: 'Untitled page content' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();

    // Escape reverts the change without persisting
    await page.getByTestId('cardTitle').click();
    await expect(page.getByTestId('cardTitleEditor')).toBeVisible();
    await expect(page.getByTestId('cardTitleInput')).toHaveValue(
      'Untitled page content',
    );
    await page.getByTestId('cardTitleInput').fill('Discarded escape');
    await page.getByTestId('cardTitleInput').press('Escape');
    await expect(page.getByTestId('cardTitleEditor')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();

    // Cancel button reverts the change without persisting
    await page.getByTestId('cardTitle').click();
    await page.getByTestId('cardTitleInput').fill('Discarded cancel');
    await page.getByTestId('cardTitleCancelButton').click();
    await expect(page.getByTestId('cardTitleEditor')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();

    // Save persists the new title and updates the tree menu
    await page.getByTestId('cardTitle').click();
    await page.getByTestId('cardTitleInput').fill('Inline edited title');
    await page.getByTestId('cardTitleSaveButton').click();
    await expect(page.getByTestId('cardTitleEditor')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /^Inline edited title$/ }),
    ).toBeVisible();
    await expect(
      page.locator('p', { hasText: 'Inline edited title' }),
    ).toBeVisible();

    // Rename back so the rest of the test suite is unaffected
    await page.getByTestId('cardTitle').click();
    await page.getByTestId('cardTitleInput').fill('Untitled page content');
    await page.getByTestId('cardTitleSaveButton').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();
  });

  test('view and edit metadata', async ({ page }) => {
    await page
      .locator('p')
      .filter({ hasText: /^Untitled page$/ })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await page
      .locator('p')
      .filter({ hasText: 'Untitled page content' })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page content$/ }),
    ).toBeVisible();

    // Verify metadata
    await expect(
      page.getByTestId('metadataView').filter({ hasText: t.cardType }),
    ).toBeVisible();
    await expect(
      page.getByTestId('metadataView').filter({ hasText: t.lastUpdated }),
    ).toBeVisible();

    // Expand metadata and enter inline edit for labels
    await page.getByTestId('showMoreButton').click();
    await page
      .getByTestId('metadataView')
      .locator('[data-cy="editableFieldRow"]', { hasText: t.labels })
      .click();

    // Add a label inline
    await page.getByTestId('labelInput').pressSequentially('testLabel');
    await page.getByTestId('labelAddButton').click();

    // Close inline edit for labels
    await page.getByTestId('fieldCancelButton').click();

    // Verify label appears in metadata view
    await expect(
      page.getByTestId('metadataView').filter({ hasText: 'testLabel' }),
    ).toBeVisible();

    // Edit the title inline via CardTitle
    await page.getByTestId('cardTitle').click();
    await page.getByTestId('cardTitleInput').fill('Updated title');
    await page.getByTestId('cardTitleSaveButton').click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Updated title$/ }),
    ).toBeVisible();

    // Edit the body content inline via CardBody
    await editPage(page);
    await expect(page.locator('.cm-editor')).toBeVisible();
    // Use typeIntoCodeMirror pattern: click content area and type
    await page.locator('.cm-content').click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type('== Updated content');
    await page.getByTestId('contentSaveButton').click();
    await dismissSaveToast(page);

    await expect(page.locator('p', { hasText: 'Updated title' })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Updated title$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Updated content' }),
    ).toBeVisible();

    // Verify label persists after content edit
    await page.getByTestId('showMoreButton').click();
    await expect(
      page.getByTestId('metadataView').filter({ hasText: 'testLabel' }),
    ).toBeVisible();
  });

  test('cancel inline body edit reverts changes (Esc and cancel button)', async ({
    page,
  }) => {
    await page
      .locator('p')
      .filter({ hasText: /^Untitled page$/ })
      .click();
    await page.locator('p').filter({ hasText: 'Updated title' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Updated title$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Updated content' }),
    ).toBeVisible();

    // Esc cancels and reverts
    await editPage(page);
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.type('discarded by escape ');
    await page.keyboard.press('Escape');
    await expect(page.locator('.cm-editor')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Updated content' }),
    ).toBeVisible();
    await expect(
      page.locator('h2', { hasText: 'discarded by escape' }),
    ).toHaveCount(0);

    // Cancel button cancels and reverts
    await editPage(page);
    await expect(page.locator('.cm-editor')).toBeVisible();
    await page.locator('.cm-content').click();
    await page.keyboard.type('discarded by cancel ');
    await page.getByTestId('contentCancelButton').click();
    await expect(page.locator('.cm-editor')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Updated content' }),
    ).toBeVisible();
    await expect(
      page.locator('h2', { hasText: 'discarded by cancel' }),
    ).toHaveCount(0);

    // Re-enter edit and verify the editor shows the unchanged original content
    await editPage(page);
    await expect(
      page.locator('.cm-editor').filter({ hasText: 'Updated content' }),
    ).toBeVisible();
    await page.getByTestId('contentCancelButton').click();
  });

  test('toggle preview while inline editing body', async ({ page }) => {
    await page
      .locator('p')
      .filter({ hasText: /^Untitled page$/ })
      .click();
    await page.locator('p').filter({ hasText: 'Updated title' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Updated title$/ }),
    ).toBeVisible();

    await editPage(page);
    await expect(page.locator('.cm-editor')).toBeVisible();

    // Toggle into preview — editor unmounts and rendered html is shown
    await page.getByTestId('contentPreviewButton').click();
    await expect(page.locator('.cm-editor')).toHaveCount(0);
    await expect(page.locator('.cm-content')).toHaveCount(0);

    // Toggle back to edit — editor remounts with the same buffer
    await page.getByTestId('contentPreviewButton').click();
    await expect(page.locator('.cm-editor')).toBeVisible();
    await expect(
      page.locator('.cm-editor').filter({ hasText: 'Updated content' }),
    ).toBeVisible();

    // Cancel to restore baseline view
    await page.getByTestId('contentCancelButton').click();
    await expect(page.locator('.cm-editor')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Updated content' }),
    ).toBeVisible();
  });

  test('select card statuses', async ({ page }) => {
    await page
      .locator('p')
      .filter({ hasText: /^Untitled page$/ })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await page.locator('p').filter({ hasText: 'Updated title' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Updated title$/ }),
    ).toBeVisible();

    // Click status button showing "Draft" and verify menu
    await page
      .getByTestId('stateSelectorButton')
      .filter({ hasText: 'Draft' })
      .click();
    await expect(page.getByRole('menu').getByText('Archive')).toBeVisible();
    await page.getByRole('menu').getByText('Approve', { exact: true }).click();

    await expect(
      page.getByTestId('stateSelectorButton').filter({ hasText: 'Approved' }),
    ).toBeVisible();
    await page
      .getByTestId('stateSelectorButton')
      .filter({ hasText: 'Approved' })
      .click();
    await page.getByRole('menu').getByText('Archive').click();

    await expect(
      page.getByTestId('stateSelectorButton').filter({ hasText: 'Deprecated' }),
    ).toBeVisible();
  });

  test('Add a link between two cards', async ({ page }) => {
    await page
      .locator('p')
      .filter({ hasText: /^Untitled page$/ })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await page.locator('p').filter({ hasText: 'Updated title' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Updated title$/ }),
    ).toBeVisible();

    await page.getByTestId('linkIconButton').click();
    await expect(
      page.locator('h2', { hasText: t.noLinkedCards }),
    ).toBeVisible();

    // Click select link type button and pick "Outbound"
    await page
      .locator('.MuiSelect-button', { hasText: t.linkForm.selectLinkType })
      .click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: 'Outbound', exact: true })
      .click();

    await expect(
      page.locator('.MuiSelect-button', { hasText: 'Outbound' }),
    ).toBeVisible();

    // Click Search card field and select Untitled page
    await page.locator('[placeholder="Search card"]').click();
    await page
      .locator('.MuiAutocomplete-option', { hasText: 'Untitled page' })
      .click();
    await page.getByTestId('addLinkButton').click();

    // Close edit mode to verify link in view mode
    await page.getByRole('button', { name: t.close }).click();

    await expect(
      page.getByTestId('cardLinkType').filter({ hasText: 'Outbound' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('cardLinkTitle').filter({ hasText: 'Untitled page' }),
    ).toBeVisible();

    // Navigate to Untitled page to check if link has appeared there
    const href = await page.getByTestId('cardLink').getAttribute('href');
    await page.goto(href!);

    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();
    // cy.visit resets redux, so the linked cards section starts collapsed — expand it
    await page.getByTestId('linkedCardsShowMoreButton').click();
    await expect(
      page.getByTestId('cardLinkType').filter({ hasText: 'Inbound' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('cardLinkTitle').filter({ hasText: 'Updated title' }),
    ).toBeVisible();
    await expect(page.getByTestId('cardLink')).toBeVisible();

    // Enter edit mode to delete the link
    await page.getByTestId('linkedCardsEditButton').click();
    await page.getByTestId('DeleteIcon').click();

    // Verify delete link dialog and click delete
    await expect(
      page.getByRole('dialog').getByRole('button', { name: t.cancel }),
    ).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: t.delete })
      .click();

    const deleteLinkToast = page
      .getByRole('presentation')
      .filter({ hasText: t.deleteLinkSuccess });
    await expect(deleteLinkToast).toBeVisible();
    await deleteLinkToast.getByTestId('notificationClose').click();
    await expect(deleteLinkToast).toHaveCount(0);

    await expect(page.getByTestId('cardLinkTitle')).toHaveCount(0);
  });

  test('delete page content', async ({ page }) => {
    await page
      .locator('p')
      .filter({ hasText: /^Untitled page$/ })
      .click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Untitled page$/ }),
    ).toBeVisible();

    await page.locator('p').filter({ hasText: 'Updated title' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: /^Updated title$/ }),
    ).toBeVisible();

    await page.getByTestId('contextMenuButton').click();
    await page.getByTestId('deleteCardButton').click();
    await page.getByTestId('confirmDeleteButton').click();

    const deleteToast = page
      .getByRole('presentation')
      .filter({ hasText: t.deleteCardSuccess });
    await expect(deleteToast).toBeVisible();
    await deleteToast.getByTestId('notificationClose').click();
    await expect(deleteToast).toHaveCount(0);
  });

  test('Move dialog for a template card lists templates and their cards', async ({
    page,
  }) => {
    const keys = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', 'assets', 'e2e-keys.json'),
        'utf8',
      ),
    ) as { localTemplateCardKey: string };
    const url = page.url();
    const projectPrefix = url.split('/projects/')[1].split('/')[0];
    await page.goto(
      `/configuration/${projectPrefix}/cards/${keys.localTemplateCardKey}`,
    );

    await page.getByTestId('contextMenuButton').click();
    await page.locator('[id="moveCardButton"]').click();

    await expect(
      page.getByRole('dialog').filter({ hasText: t.moveCardModal.title }),
    ).toBeVisible();
    await page.getByRole('dialog').getByText(t.all, { exact: true }).click();

    // The dialog must show local template groupings
    await expect(
      page.getByRole('dialog').filter({ hasText: 'bat/templates/page' }),
    ).toBeVisible();
    await expect(
      page.getByRole('dialog').filter({ hasText: 'bat/templates/checks' }),
    ).toBeVisible();

    // Template-container rows act as "move to template root" destinations
    await page
      .getByRole('dialog')
      .getByRole('treeitem')
      .filter({ hasText: 'bat/templates/checks' })
      .click();
    await expect(
      page.getByRole('dialog').getByRole('button', { name: t.move }),
    ).not.toBeDisabled();

    await page
      .getByRole('dialog')
      .getByRole('button', { name: t.cancel })
      .click();
  });

  test('test notifications and policy checks', async ({ page }) => {
    await page.getByTestId('createNewButton').click();
    await page
      .locator('.templateCard')
      .filter({ hasText: 'Policy checks and notifications' })
      .click();
    await page.getByTestId('confirmCreateButton').click();

    const createToast = page
      .getByRole('presentation')
      .filter({ hasText: t.createCardModal.success });
    await expect(createToast).toBeVisible();
    await createToast.getByTestId('notificationClose').click();
    await expect(createToast).toHaveCount(0);

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^Test notifications and policy checks$/,
      }),
    ).toBeVisible();

    const sidebar = page.getByTestId('cardSidebar');

    // Make sure notifications and policy checks sections are displayed in the sidebar
    await expect(sidebar.filter({ hasText: t.notifications })).toBeVisible();
    await expect(
      sidebar.filter({ hasText: t.passedPolicyChecks }),
    ).toBeVisible();
    await expect(
      sidebar.filter({ hasText: t.failedPolicyChecks }),
    ).toBeVisible();

    // Verify notification content
    await expect(
      sidebar.getByText('Category 1 - Notification title'),
    ).toBeVisible();
    await expect(sidebar.getByText('This is a notification!')).toBeVisible();

    // Verify failed policy check details
    await expect(
      sidebar.getByText('Category 3 - Failing check title'),
    ).toBeVisible();
    await expect(sidebar.getByText('This is a failure')).toBeVisible();
    await expect(
      sidebar.getByText(t.policyCheckFail, { exact: true }),
    ).toBeVisible();

    // Expand Passed policy checks and verify PASS label and success title
    await sidebar.getByText(t.passedPolicyChecks).click();
    await expect(
      sidebar.getByText(t.policyCheckPass, { exact: true }),
    ).toBeVisible();
    await expect(
      sidebar.getByText('Category 2 - Successful check title'),
    ).toBeVisible();
  });

  test('goToField focuses the referenced metadata field inline', async ({
    page,
  }) => {
    // Intercept the card fetch and inject a fieldName into failures so the
    // "goToField" link renders, exercising the inline focus flow end-to-end.
    await page.route('**/api/projects/*/cards/*', async (route) => {
      const response = await route.fetch();
      const body = await response.json().catch(() => null);
      if (
        body?.policyChecks?.failures &&
        Array.isArray(body.policyChecks.failures) &&
        body.policyChecks.failures.length > 0
      ) {
        body.policyChecks.failures = body.policyChecks.failures.map(
          (f: Record<string, unknown>) => ({
            ...f,
            fieldName: 'test/fieldTypes/failureTitle',
          }),
        );
        await route.fulfill({
          status: response.status(),
          headers: Object.fromEntries(
            response.headersArray().map((h) => [h.name, h.value]),
          ),
          body: JSON.stringify(body),
        });
      } else {
        await route.continue();
      }
    });

    // Navigate to the policy checks card created by the previous test
    await page
      .locator('p')
      .filter({ hasText: 'Test notifications and policy checks' })
      .click();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /^Test notifications and policy checks$/,
      }),
    ).toBeVisible();

    // No field is in edit mode initially
    await expect(page.getByTestId('fieldSaveButton')).toHaveCount(0);

    // Click the goToField link on the failing policy check
    await page
      .getByTestId('cardSidebar')
      .getByTestId('goToFieldLink')
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByTestId('cardSidebar').getByTestId('goToFieldLink'),
    ).toBeVisible();
    await page.getByTestId('cardSidebar').getByTestId('goToFieldLink').click();

    // The linked field's row is now in edit mode (save + cancel rendered)
    const fieldRow = page.locator(
      '[id="metadata-field-test/fieldTypes/failureTitle"]',
    );
    await expect(fieldRow.getByTestId('fieldSaveButton')).toBeVisible();
    await expect(fieldRow.getByTestId('fieldCancelButton')).toBeVisible();

    // No other field's row is in edit mode
    await expect(page.getByTestId('fieldSaveButton')).toHaveCount(1);

    // Close inline edit so this test does not leak state
    await fieldRow.getByTestId('fieldCancelButton').click({ force: true });
  });

  test.describe('Project selection modal', () => {
    test('opens and shows the current project', async ({ page }) => {
      await page.getByTestId('moreProjectsButton').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(
        page.getByRole('dialog').filter({ hasText: t.projectDialog.title }),
      ).toBeVisible();
      await expect(
        page.getByRole('dialog').filter({ hasText: 'Basic Acceptance Test' }),
      ).toBeVisible();
      await expect(
        page.getByRole('dialog').filter({ hasText: 'bat' }),
      ).toBeVisible();
    });

    test('can filter projects by name', async ({ page }) => {
      await page.getByTestId('moreProjectsButton').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Type a filter that matches
      await page
        .getByRole('dialog')
        .locator('input[type="text"]')
        .type('Basic');
      await expect(
        page.getByRole('dialog').filter({ hasText: 'Basic Acceptance Test' }),
      ).toBeVisible();

      // Type a filter that doesn't match
      await page
        .getByRole('dialog')
        .locator('input[type="text"]')
        .fill('nonexistent');
      await expect(
        page
          .getByRole('dialog')
          .filter({ hasText: t.projectDialog.noProjectsFound }),
      ).toBeVisible();
    });

    test('closes with cancel button', async ({ page }) => {
      await page.getByTestId('moreProjectsButton').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByText(t.cancel).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('selects and opens a project', async ({ page }) => {
      await page.getByTestId('moreProjectsButton').click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // Current project is pre-selected, so Open button should be enabled
      await page.getByRole('dialog').getByText('Basic Acceptance Test').click();
      await expect(
        page
          .getByRole('dialog')
          .getByRole('button', { name: t.projectDialog.open }),
      ).not.toBeDisabled();

      // Open the project
      await page
        .getByRole('dialog')
        .getByRole('button', { name: t.projectDialog.open })
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(page.url()).toContain('/projects/bat/cards');
    });
  });
});
