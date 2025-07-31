/// <reference types="cypress" />
// eslint-disable-next-line @typescript-eslint/no-require-imports
const t = require('../../src/locales/en/translation.json');

// These e2e tests use a 'cyberismo-bat' project that is created
// upon test run start based on the module-base repository content.
// Run these tests with ´npm run e2e:headless´

describe('Navigation', () => {
  Cypress.config('defaultCommandTimeout', 20000);

  before(() => {
    cy.task('createTestProject'); // Creates a new cyberismo-bat project based on module-base
  });

  after(() => {
    cy.wait(1000);
    cy.task('deleteTestProject'); // Deletes cyberismo-bat project
  });

  beforeEach(() => {
    cy.visit('');
  });

  it('delete page and verify empty project', () => {
    // Creates a new base module with name Basic Acceptance Test
    cy.get('h4').contains('Basic Acceptance Test'); // Verify project name
    cy.get('p').contains(t['selectCard']); // Verify text on cards page
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page'); // Verify Title in content area

    cy.get('[data-cy="contextMenuButton"]').click(); // Click dropdown menu with multiple options
    cy.get('[data-cy="deleteCardButton"]').click(); // Select Delete card option
    cy.get('[data-cy="confirmDeleteButton"]').click(); // confirm dialog
    cy.get('[role="presentation"]').contains(t['deleteCardSuccess']); // Verify text in popup infobox

    cy.get('p').contains(t['emptyProject']); // Verify text on cards page
  });

  it('Create a page', () => {
    // Creates a new basic document page card from templates
    cy.get('[data-cy="createNewCardButton"]').click(); // Click new card button in top right corner
    cy.get('.templateCard').contains('Page').click(); // Select page template
    cy.get('[data-cy="confirmCreateButton"]').click(); // confirm dialog
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox
    cy.get('p').contains('Untitled page'); // Verify text on cards page
    cy.get('[data-cy="linkIconButton"]').should('be.disabled');
  });

  it('Create a decision as a child of the page', () => {
    // Creates a child card under previously created page
    cy.get('[data-cy="createNewCardButton"]').click();
    cy.get('.templateCard').contains('Decision').click(); // Select Decision template
    cy.get('[data-cy="confirmCreateButton"]').click();
    cy.get('[role="presentation"]').contains(t.createCardModal['success']); // Verify text in popup infobox

    cy.get('p').contains('Untitled decision'); // Verify Title in tree menu
    // Verify all decision content
    cy.get('h1').contains('Untitled decision');
    cy.get('h2').contains('Context');
    cy.get('p').contains(
      'Describe background information. What is motivating this decision. Which options were considered.',
    );
    cy.get('[data-cy="linkIconButton"]').should('be.enabled');

    cy.get('h2').contains('Decision');
    cy.get('p').contains('Describe the change that we’re proposing or doing.');

    cy.get('h2').contains('Consequences');
    cy.get('p').contains(
      'Describe the benefits and drawbacks of the decision. Describe what happens next.',
    );
    // Verify table of contents
    cy.get('.toc-menu > p').contains('Table of contents');
    cy.get('.toc-menu >>> a').contains('Context');
    cy.get('.toc-menu >>> a').contains('Decision');
    cy.get('.toc-menu >>> a').contains('Consequences');
  });

  it('moves card with move function', () => {
    cy.get('p').contains('Untitled decision').click(); // Navigate to Untitled decision in tree menu
    cy.get('h1').contains('Untitled decision');

    cy.get('[aria-level="2"]').should('not.exist');
    cy.get('[aria-level="1"][data-cy="ExpandMoreIcon"]').should('not.exist'); // Verifies expand more icon does not exist in tree menu

    // moves Untitled decision card under Decision Records card with move function
    cy.get('[data-cy="contextMenuButton"]').click();
    cy.get('[id="moveCardButton"]').click(); // Select Move option

    cy.get('button').contains(t['all']).click(); // Select All in Move dialog
    cy.get('[role="dialog"] >>>>>>>> [role="treeitem"]')
      .contains('Untitled page')
      .click(); // Select Untitled page
    cy.get('[role="dialog"] >>> button').contains(t['cancel']);
    cy.get('[role="dialog"] >>> button')
      .contains(t.moveCardModal['title'])
      .click();
    cy.get('[role="presentation"]').contains(t.moveCardModal['success']); // Verify text in popup infobox
    cy.get('.MuiSnackbar-endDecorator > .MuiIconButton-root').click(); // closes popup infobox
    cy.get('[data-cy="ExpandMoreIcon"]'); // Verifies expand more icon exists in tree menu
  });

  it('view and edit metadata', () => {
    // View and Verify card metadata?
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page');

    cy.get('p').contains('Untitled decision').click(); // Navigate tree menu
    cy.get('h1').contains('Untitled decision');

    // Verify meatdata
    cy.get('[data-cy="metadataView"]').contains(t['cardKey']);
    cy.get('[data-cy="metadataView"]').contains(t['cardType']);
    cy.get('[data-cy="metadataView"]').contains(t['lastUpdated']);
    cy.get('[data-cy="metadataView"]').contains('Decision');

    // Check that edit element is visible and clicks it
    cy.get('[data-cy="editButton"]').contains(t['edit']).click(); // Clicks Edit button

    // Check that editor elements are visible
    cy.get('textarea').contains('Untitled decision'); // Verify textarea contains card title
    cy.get('.cm-editor'); // Asciidoc editor component
    cy.get('#cancelButton'); // Verifies cancel button

    // Clicking on Preview opens preview pane
    cy.get('[data-cy="previewTab"]').click(); // Select preview
    cy.get('h1').contains('Untitled decision'); // Verifies page contend displayed correctly
    cy.get('h2').contains('Context'); // Verifies page contend displayed correctly
    cy.get('.toc-menu'); // Verify table of contents
    cy.get('[data-cy="editTab"]').click(); // Select edit

    cy.get('textarea') // Edits card title
      .contains('Untitled decision')
      .clear()
      .type('Updated title');

    cy.get('[data-cy="labelInput"]').type('testLabel');
    cy.get('[data-cy="labelAddButton"]').click();
    cy.get('[role="textbox"]').invoke('text', '== Updated content'); // Edit content
    cy.get('[data-cy="updateButton"]').click(); // Clicks update button
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox

    cy.get('p').contains('Updated title'); // Title in tree menu
    cy.get('h1').contains('Updated title'); // Title in content area
    cy.get('h2').contains('Updated content'); // Text in asciidoc content
    cy.get('[data-cy="labelChip"]').contains('testLabel'); // Label in asciidoc content
  });

  it('adds an attachment image to card', () => {
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page');

    cy.get('p').contains('Updated title').click(); // Navigate to Updated title in tree menu
    cy.get('h1').contains('Updated title');

    cy.get('[data-cy="contextMenuButton"]').click(); // Click dropdown menu with multiple options
    cy.get('[data-cy="addAttachmentButton"]').click(); // Select add attachment option
    // Verify add attachment dialog contents
    cy.get('[role="dialog"] > h2').contains(t['addAttachment']); // Add attachment text
    cy.get('[role="dialog"] > button'); // X button
    cy.get('[role="dialog"] >>> button').contains(t['cancel']); // Cancel button
    cy.get('[role="dialog"] >>> button').contains(t['add']); // Add button
    // Add cyberismo.png to page
    cy.get('[data-cy="fileUploadButton"]').selectFile(
      './cypress/fixtures/cyberismo.png',
    );
    cy.get('[role="dialog"] >>> button').contains(t['add']).click(); // Click add button
    cy.get('[role="presentation"]').contains(t.addAttachmentModal['success']); // Verify text in popup infobox

    // Check that attachment side panel element exists and "hover" over it to show action buttons
    cy.get('span').contains('cyberismo.png').trigger('mouseover');
    cy.get('[data-cy="insertToContentButton"]').click();
    cy.get('[data-cy="updateButton"]').click();

    cy.get('.doc').get('img').get('[alt="cyberismo"]'); // Check that image is present in asciidoc content
  });

  it('select card statuses', () => {
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page');

    cy.get('p').contains('Updated title').click(); // Navigate to Updated title in tree menu
    cy.get('h1').contains('Updated title');
    // checks trough all possible statuses by clicking trough them in dropdown menu

    cy.get('.MuiMenuButton-variantSoft').contains('Status: Draft').click(); // Verifies text in status button and clicks it
    cy.get('[role="menu"]').contains('Reopen'); // options in dropdown menu
    cy.get('[role="menu"]').contains('Archive');
    cy.get('[role="menu"]').contains('Approve').click(); // Select Approve status
    cy.wait(1000);
    cy.get('.MuiMenuButton-variantSoft').contains('Status: Approved').click();
    cy.get('[role="menu"]').contains('Reopen');
    cy.get('[role="menu"]').contains('Archive').click();

    cy.get('.MuiMenuButton-variantSoft').contains('Status: Deprecated').click();
  });

  it('Add a link between two cards', () => {
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page');

    cy.get('p').contains('Updated title').click(); // Navigate to Updated title in tree menu
    cy.get('h1').contains('Updated title');

    cy.get('.MuiIconButton-root').click(); // Click link button
    cy.get('p').contains(t['linkedCards']); // Verifies Linked cards text in page
    cy.get('.MuiSelect-button').contains(t.linkForm['selectLinkType']).click(); // Click select link type button
    cy.get('.Mui-expanded').contains('blocks').click(); // Select blocks

    cy.get('.MuiSelect-button').contains('blocks'); // checks Select Link Type text changed to previously selected blocks option
    cy.get('.MuiAutocomplete-root').get('[placeholder="Search card"]').click(); // click Search card field
    cy.get('.MuiAutocomplete-option').contains('Untitled page').click(); // Select Untitled page
    cy.get('button').contains(t.linkForm['button']).click(); // Click add link button

    cy.get('[data-cy="cardLinkType"]').contains('blocks');
    cy.get('[data-cy="cardLinkTitle"]').contains('Untitled page');

    cy.get(':nth-child(5) > :nth-child(2)').should('not.exist'); // checks 2nd link was not created

    // Navigate to Untitled page to check if link has appeared there
    // Use cy.visit because otherwise timing issues with loading content can occur
    cy.get('[data-cy="cardLink"]')
      .invoke('attr', 'href')
      .then((href) => {
        cy.visit(href!);
      });

    // Verifies link exists in Untitled page
    cy.get('h1').contains('Untitled page');
    cy.get('[data-cy="cardLinkType"]').contains('is blocked by');
    cy.get('[data-cy="cardLinkTitle"]').contains('Updated title');
    cy.get('[data-cy="cardLink"]');

    cy.get('[data-cy="expandLinks"]').click();
    cy.get('[data-cy="DeleteIcon"]').click(); // Delete link
    // Verify delete link dialog contents and click delete
    cy.get('[role="dialog"] >>> button').contains(t['cancel']);
    cy.get('[role="dialog"] >>> button').contains(t['delete']).click();
  });

  it('Remove the attachment', () => {
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page');

    cy.get('p').contains('Updated title').click(); // Navigate to Updated title in tree menu
    cy.get('h1').contains('Updated title');
    // Check that edit element is visible and clicks it
    cy.get('[data-cy="editButton"]').contains(t['edit']).click();

    // Check that editor elements are visible
    cy.get('textarea').contains('Updated title');
    cy.get('.cm-editor'); // Asciidoc editor component

    cy.get('.MuiAspectRatio-content > img').trigger('mouseover'); // Mouseover attachment in side panel
    cy.get('[aria-label="Delete"]').trigger('mouseover'); // Mouseover attachment Delete button in side panel
    cy.get('[aria-label="Delete"]').click(); // Delete attachment in side panel

    cy.get('.MuiTypography-colorWarning').contains('0'); //verifies there are 0 attachments

    cy.get('[data-cy="updateButton"]').click();
    cy.get('[role="presentation"]').contains(t.saveCard['success']); // Verify text in popup infobox
  });

  it('delete decision', () => {
    // Deletes decision card
    cy.get('p').contains('Untitled page').click(); // Navigate to Untitled page in tree menu
    cy.get('h1').contains('Untitled page');

    cy.get('p').contains('Updated title').click(); // Navigate to Updated title in tree menu
    cy.get('h1').contains('Updated title');

    cy.get('[data-cy="contextMenuButton"]').click();
    cy.get('[data-cy="deleteCardButton"]').click();
    cy.get('[data-cy="confirmDeleteButton"]').click();
    cy.get('[role="presentation"]').contains(t['deleteCardSuccess']); // Verify text in popup infobox
  });
});
