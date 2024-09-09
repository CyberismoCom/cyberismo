/// <reference types="cypress" />

// These e2e tests assume that the default test project at
// /data-handler/test/test-data/valid/decision-records
// is in use. This is defined in .env.test
// Run these tests with ´npm run e2e:headless´

describe('Navigation', () => {
  beforeEach(() => {
    cy.visit('http://localhost:3000');
  });

  it('opens project and displays project name and content', () => {
    // User should be redirected to /cards root path
    cy.url().should('include', '/cards');

    cy.get('h4').contains('decision');
    cy.get('p').contains('Decision Records');
  });

  it('selects a card, shows card content and actions', () => {
    cy.visit('http://localhost:3000/cards/decision_6');

    // Check that content elements are visible
    cy.get('h1').contains('Document Decisions with Decision Records');
    cy.get('h2').contains('Context');
    cy.get('.toc-menu');
    cy.get('p').contains('Status: Approved');
  });

  it('opens edit card page', () => {
    cy.visit('http://localhost:3000/cards/decision_6/edit');

    // Check that editor elements are visible
    cy.get('textarea').contains('Document Decisions with Decision Records');
    cy.get('.cm-editor'); // Asciidoc editor component

    // Clicking on Preview opens preview pane
    cy.get('[data-cy="previewTab"]').click();
    cy.get('h1').contains('Document Decisions with Decision Records');
    cy.get('h2').contains('Context');
    cy.get('.toc-menu');
  });
});

describe('Modify project', () => {
  before(() => {
    // Make a backup copy of the base test data
    cy.task('makeTestDataBackup');
  });

  after(() => {
    // Restore test project from backup folder and remove beckup
    cy.task('restoreTestDataFromBackup');
  });

  it('updates card metadata and content', () => {
    cy.visit('http://localhost:3000/cards/decision_6/edit');

    cy.get('textarea')
      .contains('Document Decisions with Decision Records')
      .clear()
      .type('Updated title');
    cy.get('[role="textbox"]').invoke('text', '== Updated content');
    cy.get('[data-cy="updateButton"]').click();

    cy.get('p').contains('Updated title'); // Title in tree menu
    cy.get('h1').contains('Updated title'); // Title in content area
    cy.get('h2').contains('Updated content'); // Text in asciidoc content
  });

  it('adds an attachment image to card', () => {
    cy.visit('http://localhost:3000/cards/decision_6/edit');

    cy.get('[data-cy="contextMenuButton"]').click();
    cy.get('[data-cy="addAttachmentButton"]').click();
    cy.get('[data-cy="fileUploadButton"]').selectFile(
      './cypress/fixtures/cyberismo.png',
    );
    cy.get('[data-cy="confirmAddAttachmentButton"]').click();

    // Check that attachment side panel element exists and "hover" over it to show action buttons
    cy.get('span').contains('cyberismo.png').trigger('mouseover');
    cy.get('[data-cy="insertToContentButton"]').click();
    cy.get('[data-cy="updateButton"]').click();

    cy.get('.doc').get('img').get('[alt="cyberismo"]'); // Check that image is present in asciidoc content
  });

  it('creates a new card to project and deletes it', () => {
    cy.visit('http://localhost:3000/cards');

    cy.get('[data-cy="createNewCardButton"]').click();
    cy.get('.templateCard').contains('Decision').click();
    cy.get('[data-cy="confirmCreateButton"]').click();

    cy.get('p').contains('Untitled'); // Tree menu item

    cy.get('[data-cy="contextMenuButton"]').click();
    cy.get('[data-cy="deleteCardButton"]').click();
    cy.get('[data-cy="confirmDeleteButton"]').click();

    cy.get('p').contains('Untitled').should('not.exist');
  });
});
