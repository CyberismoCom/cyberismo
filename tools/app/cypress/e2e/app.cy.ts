/// <reference types="cypress" />

// These e2e tests assume that the default test project at
// /data-handler/test/test-data/valid/decision-records
// is in use. This is defined in .env.test
// Run these tests with ´npm run e2e:headless´

describe('Navigation', () => {
  Cypress.config('defaultCommandTimeout', 10000);
  before(() => {
    //cy.exec('cd ../../../&&git clone git@github.com:CyberismoCom/module-base.git&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat&&cd cyberismo-bat&&cyberismo import module ../module-base&&cyberismo create card base/templates/page');
    cy.exec('cd ../../../&&git clone git@github.com:CyberismoCom/module-base.git');
    cy.exec('cd ../../../&&cyberismo create project "Basic Acceptance Test" bat cyberismo-bat');
    cy.exec('cd ../../../&&cd cyberismo-bat');
    cy.exec('cd ../../../&&cyberismo import module ../module-base');
    cy.exec('cd ../../../&&cyberismo create card base/templates/page');
  });
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
    cy.visit('http://localhost:3000/cards/decision_6');
    
    // Check that edit element is visible and clicks it
    cy.get('[data-cy="editButton"]')
      .contains('Edit')
      .click();

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
//
//describe('Modify project', () => {
//  Cypress.config('defaultCommandTimeout', 10000);
//  before(() => {
//    // Make a backup copy of the base test data
//    cy.task('makeTestDataBackup');
//  });
//
//  after(() => {
//    // Restore test project from backup folder and remove beckup
//    cy.task('restoreTestDataFromBackup');
//  });
//
//  it('updates card metadata and content', () => {
//    cy.visit('http://localhost:3000/cards/decision_6/edit');
//
//    cy.get('textarea')
//      .contains('Document Decisions with Decision Records')
//      .clear()
//      .type('Updated title');
//    cy.get('[role="textbox"]').invoke('text', '== Updated content');
//    cy.get('[data-cy="updateButton"]').click();
//    cy.get('[role="presentation"]').contains('Card saved successfully'); // checks text in popup infobox 
//  
//    cy.get('p').contains('Updated title'); // Title in tree menu
//    cy.get('h1').contains('Updated title'); // Title in content area
//    cy.get('h2').contains('Updated content'); // Text in asciidoc content
//  });
//
//  it('adds an attachment image to card', () => {
//    cy.visit('http://localhost:3000/cards/decision_6/edit');
//
//    cy.get('[data-cy="contextMenuButton"]').click();
//    cy.get('[data-cy="addAttachmentButton"]').click();
//    cy.get('[data-cy="fileUploadButton"]').selectFile(
//      './cypress/fixtures/cyberismo.png',
//    );
//    cy.get('[data-cy="confirmAddAttachmentButton"]').click();
//    cy.get('[role="presentation"]').contains('Attachment(s) added successfully'); // checks text in popup infobox 
//
//    // Check that attachment side panel element exists and "hover" over it to show action buttons
//    cy.get('span').contains('cyberismo.png').trigger('mouseover');
//    cy.get('[data-cy="insertToContentButton"]').click();
//    cy.get('[data-cy="updateButton"]').click();
//
//    cy.get('.doc').get('img').get('[alt="cyberismo"]'); // Check that image is present in asciidoc content
//  });
//
//  it('creates a new card to project and deletes it', () => {
//    cy.visit('http://localhost:3000/cards');
//
//    cy.get('[data-cy="createNewCardButton"]').click();
//    cy.get('.templateCard').contains('Decision').click();
//    cy.get('[data-cy="confirmCreateButton"]').click();
//    cy.get('[role="presentation"]').contains('Card created successfully'); // checks text in popup infobox 
//  
//    cy.get('p').contains('Untitled'); // Tree menu item
//
//    cy.get('[data-cy="contextMenuButton"]').click();
//    cy.get('[data-cy="deleteCardButton"]').click();
//    cy.get('[data-cy="confirmDeleteButton"]').click();
//    cy.get('[role="presentation"]').contains('Card deleted successfully'); // checks text in popup infobox 
//  
//    cy.get('p').contains('Untitled').should('not.exist');
//  });
//
//  it('moves card with drag and move function', () => {
//    cy.visit('http://localhost:3000/cards/decision_6');
//    cy.get('h1').contains('Updated title'); // Title in content area
//    cy.get('[aria-level="2"]').contains('Updated title');
//    cy.get('[data-testid="ExpandMoreIcon"]');
//    cy.get('p').contains('Updated title').drag('.MuiTypography-h4'); // moves Updated title card from under Decision Records card by dragging
//    cy.get('p').contains('Updated title').drag('.MuiTypography-h4'); // needs a second drad to succeed
//    cy.get('[aria-level="2"]').should('not.exist');
//    cy.get('[data-testid="ExpandMoreIcon"]').should('not.exist');
//
//    // moves Updated title card back under Decision Records card with move function
//    cy.get('[data-cy="contextMenuButton"]').click();
//    cy.get('[id="moveCardButton"]').click();
//    cy.get('button').contains('All').click();
//    cy.get('[style="height: 24px; width: 100%;"] > [role="treeitem"] > .css-122bc6x').click();
//    cy.get('button').contains('Cancel');
//    cy.get('button').contains('Move').click();
//    cy.get('[role="presentation"]').contains('Card moved successfully'); // checks text in popup infobox 
//    cy.get('.MuiSnackbar-endDecorator > .MuiIconButton-root').click(); // closes popup infobox 
//    cy.get('[aria-level="2"]').contains('Updated title');
//    cy.get('[data-testid="ExpandMoreIcon"]');
//  });
//
//  it('check statuses', () => {
//    cy.visit('http://localhost:3000/cards/decision_6');
//    // checks trough all possible statuses by clicking trough them in dropdown menu
//    cy.get('.MuiMenuButton-variantSoft').contains('Status: Approved').click(); // checks text in status button
//    cy.get('[role="menu"]').contains('Reopen'); // options in dropdown menu
//    cy.get('[role="menu"]').contains('Deprecate');
//    cy.get('[role="menu"]').contains('Reject').click();
//
//    cy.get('.MuiMenuButton-variantSoft').contains('Status: Rejected').click();
//    cy.get('[role="menu"]').contains('Reject');
//    cy.get('[role="menu"]').contains('Rereject');
//    cy.get('[role="menu"]').contains('Reopen').click();
//
//    cy.get('.MuiMenuButton-variantSoft').contains('Status: Draft').click();
//    cy.get('[role="menu"]').contains('Reopen');
//    cy.get('[role="menu"]').contains('Reject');
//    cy.get('[role="menu"]').contains('Approve').click();
//    
//    cy.get('.MuiMenuButton-variantSoft').contains('Status: Approved').click();
//    cy.get('[role="menu"]').contains('Deprecate').click();
//
//    cy.get('.MuiMenuButton-variantSoft').contains('Status: Deprecated');
//  });
//
//  it('Add a link between two cards', () => {
//    cy.visit('http://localhost:3000/cards/decision_5');
//    cy.get('.MuiIconButton-root').click();
//    cy.get('.MuiSelect-button').contains('Select Link Type').click();
//    cy.get('p').contains('Linked cards');
//
//    cy.get('.Mui-expanded').contains('test').click();
//    cy.get('.MuiSelect-button').contains('test'); // checks Select Link Type text changed to previously clicked test option
//    cy.get('.MuiAutocomplete-root').get('[placeholder="Search card"]').click();
//    cy.get('.MuiAutocomplete-option').contains('Updated title (decision_6)').click();
//    cy.get('.MuiAutocomplete-root').get('[value="Updated title(decision_6)"]');
//    cy.get('[placeholder="Write a link description"]');
//    cy.get('input')
//      .get('[placeholder="Write a link description"]')
//      .type('Updated description');
//    cy.get('input').get('[value="Updated description"]')
//    cy.get('button').contains('Add link').click();
//
//    cy.get(':nth-child(5) > :nth-child(2)').should('not.exist'); // checks 2nd link was not created
//    cy.get('.css-qmy8nh-JoyStack-root > .MuiStack-root > .MuiTypography-body-sm').contains('test');
//    cy.get('.css-qmy8nh-JoyStack-root > .MuiStack-root > .MuiTypography-title-sm').contains('Updated title');
//    cy.get('.css-qmy8nh-JoyStack-root > .css-110jrj0-JoyTypography-root').contains('Updated description');
//    cy.get('a').get('[href="/cards/decision_6"]').contains('decision_6').click();
//
//    cy.get('h1').contains('Updated title'); // Title in content area
//    cy.get('.css-qmy8nh-JoyStack-root > .MuiStack-root > .MuiTypography-body-sm').contains('test');
//    cy.get('.css-qmy8nh-JoyStack-root > .MuiStack-root > .MuiTypography-title-sm').contains('Decision Records');
//    cy.get('.css-qmy8nh-JoyStack-root > .css-110jrj0-JoyTypography-root').contains('Updated description');
//    cy.get('a').get('[href="/cards/decision_5"]').contains('decision_5');
//    cy.get('button').get('[data-testid="DeleteIcon"]').click();
//    cy.get('button').contains('Cancel');
//    cy.get('button').contains('Delete').click();
//  });
// });