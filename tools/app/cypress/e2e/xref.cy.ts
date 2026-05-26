/// <reference types="cypress" />
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require('../../src/locales/en/translation.json');

const editPage = () =>
  cy.get('[data-cy="editBodyButton"]').click({ force: true });

const saveContent = () => {
  cy.get('[data-cy="contentSaveButton"]').click();
  cy.get('.cm-editor').should('not.exist');
  cy.get('[role="presentation"]')
    .contains(t.saveCard['success'])
    .closest('[role="presentation"]')
    .find('[data-cy="notificationClose"]')
    .click();
};

const createPage = () => {
  cy.get('[data-cy="createNewButton"]').click();
  cy.get('.templateCard').contains('Page').click();
  cy.get('[data-cy="confirmCreateButton"]').click();
  cy.get('[role="presentation"]').contains(t.createCardModal['success']);
  cy.get('[data-cy="notificationClose"]').click();
  cy.contains('h1', /^Untitled page$/);
};

// These e2e tests use the 'cyberismo-bat' project created at test-run start
// from the module-base repository. Run with `pnpm e2e:headless` or
// `pnpm e2e:xref`.
describe('Native AsciiDoc xref', () => {
  Cypress.config('defaultCommandTimeout', 20000);

  beforeEach(() => {
    cy.visit('');
    cy.url().should('include', '/projects/');
  });

  it('renders xref:KEY.adoc[label] as a multi-project link and navigates to the target', () => {
    const captured: { prefix?: string; aKey?: string; bKey?: string } = {};

    // Capture the current /projects/<prefix>/ scope from the post-redirect URL.
    cy.url().then((url) => {
      const match = url.match(/\/projects\/([^/]+)/);
      if (!match) throw new Error(`expected /projects/<prefix> in URL: ${url}`);
      captured.prefix = match[1];
    });

    // Create card A and capture its key.
    createPage();
    cy.url().then((url) => {
      captured.aKey = url.split('/cards/')[1];
      expect(captured.aKey, 'card A key').to.match(/.+_.+/);
    });

    // Create card B and capture its key.
    createPage();
    cy.url().then((url) => {
      captured.bKey = url.split('/cards/')[1];
      expect(captured.bKey, 'card B key').to.match(/.+_.+/);
    });

    // Navigate back to card A.
    cy.then(() => {
      cy.visit(`/projects/${captured.prefix}/cards/${captured.aKey}`);
    });
    cy.contains('h1', /^Untitled page$/);

    // Edit A's body, replacing the placeholder content with a native xref.
    editPage();
    cy.get('.cm-activeLine').clear();
    cy.then(() => {
      cy.get('.cm-content').type(
        `See xref:${captured.bKey}.adoc[Go to B] please.`,
      );
    });
    saveContent();

    // Assert the rendered HTML contains a link with the canonical multi-project href.
    cy.then(() => {
      const expectedHref = `/projects/${captured.prefix}/cards/${captured.bKey}`;
      cy.get('[class="doc"]')
        .find('a')
        .filter('[href]')
        .first()
        .should(($a) => {
          expect($a.attr('href')).to.equal(expectedHref);
          expect($a.text()).to.equal('Go to B');
        });

      // Click the link and confirm SPA navigation to card B.
      cy.get('[class="doc"]').find('a').contains('Go to B').click();
      cy.url().should('include', expectedHref);
      cy.contains('h1', /^Untitled page$/);
    });
  });
});
